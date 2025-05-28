import { Router, Request, Response } from 'express';
import { ConfigLoader } from '../utils/config-loader';
import { GitSyncService } from '../services/git-sync';
import { VectorStore } from '../services/vector-store';
import { RepositoryConfig } from '../types/config';
import logger from '../utils/logger';

export default function createRepoRoutes(
  configLoader: ConfigLoader,
  gitSync: GitSyncService,
  vectorStore: VectorStore
): Router {
  const router = Router();

  router.get('/status', async (req: Request, res: Response) => {
    try {
      const config = configLoader.getConfig();
      const stats = await vectorStore.getStats();

      return res.json({
        repositories: config.repositories.map(repo => ({
          name: repo.name,
          url: repo.url,
          branch: repo.branch,
          priority: repo.priority,
          category: repo.category,
          syncInterval: repo.syncInterval,
          paths: repo.paths,
          authType: repo.authType
        })),
        stats
      });
    } catch (error) {
      logger.error('Failed to get repository status', { error });
      return res.status(500).json({
        error: 'Failed to get repository status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.post('/sync', async (req: Request, res: Response) => {
    try {
      const { repository } = req.body;
      const config = configLoader.getConfig();

      if (repository) {
        const repo = config.repositories.find(r => r.name === repository);
        if (!repo) {
          return res.status(404).json({
            error: `Repository not found: ${repository}`
          });
        }

        await gitSync.syncRepository(repo);
        return res.json({
          message: `Repository ${repository} synced successfully`,
          repository
        });
      } else {
        await gitSync.syncAll(config.repositories);
        return res.json({
          message: 'All repositories synced successfully',
          count: config.repositories.length
        });
      }
    } catch (error) {
      logger.error('Repository sync failed', { error });
      return res.status(500).json({
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.post('/add', async (req: Request, res: Response) => {
    try {
      const repository: RepositoryConfig = {
        name: req.body.name,
        url: req.body.url,
        branch: req.body.branch || 'main',
        authType: req.body.authType || 'none',
        credentials: req.body.credentials,
        paths: req.body.paths || ['/'],
        exclude: req.body.exclude || ['node_modules', '.git', 'dist', 'build'],
        syncInterval: req.body.syncInterval || 60,
        priority: req.body.priority || 'medium',
        category: req.body.category,
        metadata: req.body.metadata || {}
      };

      if (!repository.name || !repository.url) {
        return res.status(400).json({
          error: 'Repository name and url are required'
        });
      }

      configLoader.addRepository(repository);
      await configLoader.saveConfig();

      await gitSync.syncRepository(repository);
      
      if (repository.syncInterval && repository.syncInterval > 0) {
        gitSync.startScheduledSync(repository);
      }

      return res.json({
        message: `Repository ${repository.name} added successfully`,
        repository
      });
    } catch (error) {
      logger.error('Failed to add repository', { error });
      return res.status(500).json({
        error: 'Failed to add repository',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.put('/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const updates = req.body;

      configLoader.updateRepository(name, updates);
      await configLoader.saveConfig();

      const config = configLoader.getConfig();
      const updatedRepo = config.repositories.find(r => r.name === name);

      if (updatedRepo && updates.syncInterval !== undefined) {
        if (updates.syncInterval > 0) {
          gitSync.startScheduledSync(updatedRepo);
        } else {
          gitSync.stopScheduledSync(name);
        }
      }

      return res.json({
        message: `Repository ${name} updated successfully`,
        repository: updatedRepo
      });
    } catch (error) {
      logger.error('Failed to update repository', { error });
      return res.status(500).json({
        error: 'Failed to update repository',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.delete('/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const config = configLoader.getConfig();
      const repo = config.repositories.find(r => r.name === name);

      if (!repo) {
        return res.status(404).json({
          error: `Repository not found: ${name}`
        });
      }

      await vectorStore.deleteByRepository(name);
      await gitSync.deleteRepository(repo);
      
      configLoader.removeRepository(name);
      await configLoader.saveConfig();

      return res.json({
        message: `Repository ${name} deleted successfully`
      });
    } catch (error) {
      logger.error('Failed to delete repository', { error });
      return res.status(500).json({
        error: 'Failed to delete repository',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

