import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { GitSyncService } from '../services/git-sync';
import { ConfigLoader } from '../utils/config-loader';
import logger from '../utils/logger';

interface GitHubWebhookPayload {
  ref?: string;
  repository?: {
    name: string;
    full_name: string;
    clone_url: string;
  };
  commits?: Array<{
    added: string[];
    removed: string[];
    modified: string[];
  }>;
}

interface GitLabWebhookPayload {
  ref?: string;
  project?: {
    name: string;
    path_with_namespace: string;
    git_http_url: string;
  };
  commits?: Array<{
    added: string[];
    removed: string[];
    modified: string[];
  }>;
}

export default function createWebhookRoutes(
  configLoader: ConfigLoader,
  gitSync: GitSyncService
): Router {
  const router = Router();

  // GitHub webhook
  router.post('/github', async (req: Request, res: Response) => {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;
      const event = req.headers['x-github-event'] as string;

      // Verify webhook signature if secret is configured
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      if (webhookSecret && !verifyGitHubSignature(req.body, signature, webhookSecret)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      if (event !== 'push') {
        return res.json({ message: 'Event ignored', event });
      }

      const payload = req.body as GitHubWebhookPayload;
      const repoUrl = payload.repository?.clone_url;
      
      if (!repoUrl) {
        return res.status(400).json({ error: 'Repository URL not found' });
      }

      const config = configLoader.getConfig();
      const repo = config.repositories.find(r => 
        r.url === repoUrl || 
        r.url === repoUrl.replace('.git', '') ||
        r.url.replace('.git', '') === repoUrl
      );

      if (!repo) {
        logger.warn('Webhook received for unconfigured repository', { url: repoUrl });
        return res.json({ message: 'Repository not configured' });
      }

      // Extract changed files
      const changedFiles = new Set<string>();
      payload.commits?.forEach(commit => {
        commit.added?.forEach(file => changedFiles.add(file));
        commit.modified?.forEach(file => changedFiles.add(file));
      });

      logger.info('GitHub webhook received', {
        repository: repo.name,
        ref: payload.ref,
        changedFiles: changedFiles.size
      });

      // Trigger async sync
      setImmediate(async () => {
        try {
          await gitSync.syncRepository(repo);
        } catch (error) {
          logger.error('Webhook sync failed', { repository: repo.name, error });
        }
      });

      return res.json({ 
        message: 'Webhook processed',
        repository: repo.name,
        changedFiles: changedFiles.size
      });
    } catch (error) {
      logger.error('GitHub webhook error', { error });
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // GitLab webhook
  router.post('/gitlab', async (req: Request, res: Response) => {
    try {
      const token = req.headers['x-gitlab-token'] as string;
      const event = req.headers['x-gitlab-event'] as string;

      // Verify webhook token if configured
      const webhookToken = process.env.GITLAB_WEBHOOK_TOKEN;
      if (webhookToken && token !== webhookToken) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (event !== 'Push Hook') {
        return res.json({ message: 'Event ignored', event });
      }

      const payload = req.body as GitLabWebhookPayload;
      const repoUrl = payload.project?.git_http_url;
      
      if (!repoUrl) {
        return res.status(400).json({ error: 'Repository URL not found' });
      }

      const config = configLoader.getConfig();
      const repo = config.repositories.find(r => 
        r.url === repoUrl || 
        r.url === repoUrl.replace('.git', '') ||
        r.url.replace('.git', '') === repoUrl
      );

      if (!repo) {
        logger.warn('Webhook received for unconfigured repository', { url: repoUrl });
        return res.json({ message: 'Repository not configured' });
      }

      logger.info('GitLab webhook received', {
        repository: repo.name,
        ref: payload.ref
      });

      // Trigger async sync
      setImmediate(async () => {
        try {
          await gitSync.syncRepository(repo);
        } catch (error) {
          logger.error('Webhook sync failed', { repository: repo.name, error });
        }
      });

      return res.json({ 
        message: 'Webhook processed',
        repository: repo.name
      });
    } catch (error) {
      logger.error('GitLab webhook error', { error });
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Generic webhook for other providers
  router.post('/generic/:repository', async (req: Request, res: Response) => {
    try {
      const { repository } = req.params;
      const authHeader = req.headers.authorization;

      // Basic auth check
      const webhookAuth = process.env.WEBHOOK_AUTH;
      if (webhookAuth && authHeader !== `Bearer ${webhookAuth}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const config = configLoader.getConfig();
      const repo = config.repositories.find(r => r.name === repository);

      if (!repo) {
        return res.status(404).json({ error: `Repository not found: ${repository}` });
      }

      logger.info('Generic webhook received', { repository: repo.name });

      // Trigger async sync
      setImmediate(async () => {
        try {
          await gitSync.syncRepository(repo);
        } catch (error) {
          logger.error('Webhook sync failed', { repository: repo.name, error });
        }
      });

      return res.json({ 
        message: 'Webhook processed',
        repository: repo.name
      });
    } catch (error) {
      logger.error('Generic webhook error', { error });
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  return router;
}

function verifyGitHubSignature(
  payload: any,
  signature: string,
  secret: string
): boolean {
  if (!signature) return false;

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

