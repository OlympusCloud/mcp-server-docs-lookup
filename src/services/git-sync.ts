import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as cron from 'node-cron';
import { RepositoryConfig } from '../types/config';
import logger from '../utils/logger';
import { retry, retryStrategies } from '../utils/retry';
import { RepositoryError, AuthenticationError } from '../utils/errors';
import { SecurityValidator } from '../utils/security';

export interface GitSyncEvents {
  'sync:start': (repo: RepositoryConfig) => void;
  'sync:complete': (repo: RepositoryConfig, changes: string[]) => void;
  'sync:error': (repo: RepositoryConfig, error: Error) => void;
  'file:changed': (repo: RepositoryConfig, filepath: string) => void;
}

export class GitSyncService extends EventEmitter {
  private reposDir: string;
  private syncTasks: Map<string, cron.ScheduledTask>;
  private syncInProgress: Set<string>;
  private repositories: RepositoryConfig[] = [];

  constructor(reposDir?: string) {
    super();
    this.reposDir = reposDir || path.join(process.cwd(), 'data', 'repositories');
    
    // Validate repos directory is safe
    try {
      this.reposDir = SecurityValidator.validatePath(this.reposDir, {
        allowedPaths: [process.cwd()],
        allowSymlinks: false,
        maxDepth: 10  // Increased for deep project paths
      });
    } catch (error) {
      logger.error('Invalid repository directory', { error });
      throw error;
    }
    
    this.syncTasks = new Map();
    this.syncInProgress = new Set();
    this.ensureReposDir();
  }

  private ensureReposDir(): void {
    if (!fs.existsSync(this.reposDir)) {
      fs.mkdirSync(this.reposDir, { recursive: true });
      logger.info(`Created repositories directory: ${this.reposDir}`);
    }
  }

  private getRepoPath(repo: RepositoryConfig): string {
    // Sanitize repository name
    const safeName = repo.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const repoPath = path.join(this.reposDir, safeName);
    
    // Validate the path is safe
    return SecurityValidator.validatePath(repoPath, {
      allowedPaths: [this.reposDir],
      allowSymlinks: false
    });
  }

  private async getAuth(repo: RepositoryConfig): Promise<any> {
    switch (repo.authType) {
      case 'token': {
        // Check for token in config or environment variable
        const token = repo.credentials?.token || process.env.GITHUB_TOKEN;
        if (!token) {
          throw new AuthenticationError('Token required for authentication. Set GITHUB_TOKEN environment variable or provide credentials.token in config');
        }
        return {
          username: 'x-access-token',
          password: token
        };
      }
      
      case 'ssh':
        throw new RepositoryError('SSH authentication not yet implemented');
      
      case 'none':
      default:
        return undefined;
    }
  }

  async cloneRepository(repo: RepositoryConfig): Promise<void> {
    // Validate repository URL
    SecurityValidator.validateRepositoryUrl(repo.url);
    
    const repoPath = this.getRepoPath(repo);
    
    if (fs.existsSync(repoPath)) {
      logger.info(`Repository already exists: ${repo.name}`);
      return;
    }

    logger.info(`Cloning repository: ${repo.name}`);
    
    try {
      await retry(async () => {
        await git.clone({
          fs,
          http,
          dir: repoPath,
          url: repo.url,
          ref: repo.branch,
          singleBranch: true,
          depth: 1,
          ...await this.getAuth(repo),
          onProgress: (event) => {
            if (event.phase === 'Downloading') {
              logger.info(`Cloning ${repo.name}: ${event.loaded}/${event.total} bytes`);
            }
          }
        });
      }, {
        ...retryStrategies.gitSync,
        maxAttempts: 2,  // Reduce retries for large repos
        maxDelay: 10000
      });

      logger.info(`Successfully cloned repository: ${repo.name}`);
    } catch (error) {
      throw new RepositoryError(`Failed to clone repository ${repo.name}`, { 
        url: repo.url,
        error: error 
      });
    }
  }

  private async detectActualBranch(repo: RepositoryConfig): Promise<string> {
    const repoPath = this.getRepoPath(repo);
    const configuredBranch = repo.branch || 'main';
    
    try {
      // Try the configured branch first
      await git.resolveRef({
        fs,
        dir: repoPath,
        ref: `refs/heads/${configuredBranch}`
      });
      return configuredBranch;
    } catch (error) {
      // If configured branch doesn't exist, try common alternatives
      const alternatives = ['main', 'master', 'develop'];
      for (const branch of alternatives) {
        if (branch === configuredBranch) continue; // Already tried
        try {
          await git.resolveRef({
            fs,
            dir: repoPath,
            ref: `refs/heads/${branch}`
          });
          logger.warn(`Branch '${configuredBranch}' not found for ${repo.name}, using '${branch}' instead`);
          return branch;
        } catch {
          // Continue trying
        }
      }
      
      // Try checking remotes
      try {
        const remotes = await git.listBranches({
          fs,
          dir: repoPath,
          remote: 'origin'
        });
        if (remotes.length > 0) {
          const fallbackBranch = remotes[0];
          logger.warn(`Using remote branch '${fallbackBranch}' for ${repo.name}`);
          return fallbackBranch;
        }
      } catch {
        // Continue
      }
      
      throw new Error(`Could not determine branch for repository ${repo.name}`);
    }
  }

  async pullRepository(repo: RepositoryConfig): Promise<string[]> {
    const repoPath = this.getRepoPath(repo);
    
    // Validate repository URL
    if (!repo.url || !repo.url.includes('git')) {
      throw new RepositoryError(`Invalid repository URL: ${repo.url}`, { repository: repo.name });
    }
    
    if (!fs.existsSync(repoPath)) {
      try {
        await this.cloneRepository(repo);
        return await this.getAllFiles(repo);
      } catch (error) {
        logger.error(`Failed to clone repository ${repo.name}`, { error });
        throw new RepositoryError(`Failed to clone repository ${repo.name}`, { 
          repository: repo.name,
          url: repo.url,
          originalError: error 
        });
      }
    }

    logger.info(`Pulling updates for repository: ${repo.name}`);
    
    try {
      // Check if repository is in a valid state
      // Check if repository is in a valid state\n      try {\n        const gitDir = path.join(repoPath, '.git');\n        if (!fs.existsSync(gitDir)) {\n          throw new Error('Repository is not a valid git repository');\n        }\n      } catch (error) {\n        logger.warn(`Repository ${repo.name} is in invalid state, will re-clone`, { error });\n        await fs.promises.rm(repoPath, { recursive: true, force: true });\n        await this.cloneRepository(repo);\n        return await this.getAllFiles(repo);\n      }
      
      const beforeCommit = await git.resolveRef({
        fs,
        dir: repoPath,
        ref: 'HEAD'
      });

      // Detect the actual branch to use
      const actualBranch = await this.detectActualBranch(repo);
      
      await retry(async () => {
        await git.pull({
          fs,
          http,
          dir: repoPath,
          ref: actualBranch,
          singleBranch: true,
          author: {
            name: 'MCP Server',
            email: 'mcp@olympus-cloud.com'
          },
          ...await this.getAuth(repo)
        });
      }, {
        ...retryStrategies.gitSync,
        maxAttempts: 2, // Reduced for faster failure
        onRetry: (error, attempt) => {
          logger.warn(`Retrying pull for ${repo.name}`, {
            attempt,
            error: error.message.substring(0, 200)
          });
        }
      });

      const afterCommit = await git.resolveRef({
        fs,
        dir: repoPath,
        ref: 'HEAD'
      });

      if (beforeCommit === afterCommit) {
        logger.info(`No changes in repository: ${repo.name}`);
        // For Olympus docs, force processing all files on first sync
        if (repo.name === 'olympus-docs') {
          logger.info(`Force processing all files for ${repo.name}`);
          return await this.getAllFiles(repo);
        }
        return [];
      }

      const changes = await this.getChangedFiles(repo, beforeCommit, afterCommit);
      logger.info(`Pulled updates for repository: ${repo.name}`, { 
        changes: changes.length 
      });

      return changes;
    } catch (error) {
      throw new RepositoryError(`Failed to pull repository ${repo.name}`, { 
        error 
      });
    }
  }

  private async getChangedFiles(
    repo: RepositoryConfig, 
    fromCommit: string, 
    toCommit: string
  ): Promise<string[]> {
    const repoPath = this.getRepoPath(repo);
    
    try {
      const changes = await git.walk({
        fs,
        dir: repoPath,
        trees: [
          git.TREE({ ref: fromCommit }),
          git.TREE({ ref: toCommit })
        ],
        map: async function(filepath, [A, B]) {
          if (!A && B) return filepath;
          if (A && !B) return filepath;
          if (A && B) {
            const Aoid = await A.oid();
            const Boid = await B.oid();
            if (Aoid !== Boid) return filepath;
          }
          return null;
        }
      });

      return changes.filter(Boolean) as string[];
    } catch (error) {
      logger.error(`Failed to get changed files for ${repo.name}`, { error });
      return await this.getAllFiles(repo);
    }
  }

  private async getAllFiles(repo: RepositoryConfig): Promise<string[]> {
    // const repoPath = this.getRepoPath(repo);
    const files: string[] = [];

    async function walk(dir: string, baseDir: string): Promise<void> {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        if (entry.isDirectory()) {
          if (!repo.exclude?.some(pattern => relativePath.includes(pattern))) {
            await walk(fullPath, baseDir);
          }
        } else {
          files.push(relativePath);
        }
      }
    }

    for (const repoPath of repo.paths || ['/']) {
      const fullPath = path.join(this.getRepoPath(repo), repoPath);
      if (fs.existsSync(fullPath)) {
        await walk(fullPath, this.getRepoPath(repo));
      }
    }

    return files;
  }

  async syncRepository(repo: RepositoryConfig): Promise<void> {
    if (this.syncInProgress.has(repo.name)) {
      logger.warn(`Sync already in progress for repository: ${repo.name}`);
      return;
    }

    this.syncInProgress.add(repo.name);
    this.emit('sync:start', repo);

    try {
      const changes = await this.pullRepository(repo);
      
      for (const file of changes) {
        this.emit('file:changed', repo, file);
      }

      this.emit('sync:complete', repo, changes);
    } catch (error) {
      this.emit('sync:error', repo, error as Error);
      throw error;
    } finally {
      this.syncInProgress.delete(repo.name);
    }
  }

  async syncAll(repositories: RepositoryConfig[]): Promise<void> {
    logger.info(`Starting sync for ${repositories.length} repositories`);
    this.repositories = repositories;
    
    const promises = repositories.map(repo => 
      this.syncRepository(repo).catch(error => {
        logger.error(`Failed to sync repository: ${repo.name}`, { 
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          repo: repo.name,
          url: repo.url
        });
      })
    );

    await Promise.all(promises);
    logger.info('Completed sync for all repositories');
  }

  getRepositories(): RepositoryConfig[] {
    return this.repositories;
  }

  startScheduledSync(repo: RepositoryConfig): void {
    this.stopScheduledSync(repo.name);

    const cronExpression = `*/${repo.syncInterval} * * * *`;
    
    const task = cron.schedule(cronExpression, async () => {
      logger.info(`Running scheduled sync for repository: ${repo.name}`);
      try {
        await this.syncRepository(repo);
      } catch (error) {
        logger.error(`Scheduled sync failed for repository: ${repo.name}`, { error });
      }
    });

    this.syncTasks.set(repo.name, task);
    task.start();
    
    logger.info(`Scheduled sync started for repository: ${repo.name}`, { 
      interval: `${repo.syncInterval} minutes` 
    });
  }

  stopScheduledSync(repoName: string): void {
    const task = this.syncTasks.get(repoName);
    if (task) {
      task.stop();
      this.syncTasks.delete(repoName);
      logger.info(`Scheduled sync stopped for repository: ${repoName}`);
    }
  }

  stopAllScheduledSyncs(): void {
    for (const [, task] of this.syncTasks) {
      task.stop();
    }
    this.syncTasks.clear();
    logger.info('All scheduled syncs stopped');
  }

  async getFileContent(repo: RepositoryConfig, filepath: string): Promise<string> {
    const fullPath = path.join(this.getRepoPath(repo), filepath);
    
    try {
      // Check if the path is a directory first
      const stat = await fs.promises.stat(fullPath);
      if (stat.isDirectory()) {
        throw new Error(`Path is a directory, not a file: ${filepath}`);
      }
      
      return await fs.promises.readFile(fullPath, 'utf-8');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Path is a directory')) {
        throw new RepositoryError(`Cannot read directory as file: ${filepath}`, { 
          repository: repo.name,
          error 
        });
      }
      throw new RepositoryError(`Failed to read file: ${filepath}`, { 
        repository: repo.name,
        error 
      });
    }
  }

  async deleteRepository(repo: RepositoryConfig): Promise<void> {
    const repoPath = this.getRepoPath(repo);
    
    this.stopScheduledSync(repo.name);
    
    if (fs.existsSync(repoPath)) {
      await fs.promises.rm(repoPath, { recursive: true, force: true });
      logger.info(`Deleted repository: ${repo.name}`);
    }
  }
}

export default GitSyncService;