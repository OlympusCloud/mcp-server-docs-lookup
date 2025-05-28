import { VectorStore } from './vector-store';
import { logger } from "../utils/logger-stub"
import { metrics } from './metrics';
import * as cron from 'node-cron';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface RetentionPolicy {
  name: string;
  maxAge?: number; // Max age in milliseconds
  maxSize?: number; // Max size in bytes
  maxDocuments?: number; // Max number of documents
  schedule?: string; // Cron schedule for cleanup
  enabled: boolean;
}

export interface CleanupResult {
  policy: string;
  deletedDocuments: number;
  deletedChunks: number;
  freedSpace: number;
  duration: number;
  errors: string[];
}

export class DataRetentionService {
  private policies: Map<string, RetentionPolicy> = new Map();
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private cleanupInProgress = false;

  constructor(
    private vectorStore: VectorStore,
    private dataDir: string = './data'
  ) {
    this.loadDefaultPolicies();
  }

  private loadDefaultPolicies(): void {
    const defaultPolicies: RetentionPolicy[] = [
      {
        name: 'old_documents',
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
        schedule: '0 2 * * *', // Daily at 2 AM
        enabled: true
      },
      {
        name: 'large_repositories',
        maxSize: 1024 * 1024 * 1024, // 1GB per repository
        schedule: '0 3 * * 0', // Weekly on Sunday at 3 AM
        enabled: true
      },
      {
        name: 'document_limit',
        maxDocuments: 100000,
        schedule: '0 4 * * *', // Daily at 4 AM
        enabled: true
      },
      {
        name: 'orphaned_chunks',
        schedule: '0 5 * * *', // Daily at 5 AM
        enabled: true
      }
    ];

    defaultPolicies.forEach(policy => {
      this.addPolicy(policy);
    });
  }

  addPolicy(policy: RetentionPolicy): void {
    this.policies.set(policy.name, policy);
    
    if (policy.enabled && policy.schedule) {
      this.schedulePolicy(policy);
    }
    
    logger.info(`Added retention policy: ${policy.name}`, { policy });
  }

  removePolicy(name: string): void {
    const job = this.scheduledJobs.get(name);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(name);
    }
    
    this.policies.delete(name);
    logger.info(`Removed retention policy: ${name}`);
  }

  private schedulePolicy(policy: RetentionPolicy): void {
    if (!policy.schedule) return;

    const job = cron.schedule(policy.schedule, async () => {
      try {
        await this.executePolicy(policy.name);
      } catch (error) {
        logger.error(`Failed to execute retention policy: ${policy.name}`, { error });
        metrics.increment('retention.policy.failed', { policy: policy.name });
      }
    });

    this.scheduledJobs.set(policy.name, job);
    logger.info(`Scheduled retention policy: ${policy.name}`, { schedule: policy.schedule });
  }

  async executePolicy(policyName: string): Promise<CleanupResult> {
    const policy = this.policies.get(policyName);
    if (!policy) {
      throw new Error(`Policy not found: ${policyName}`);
    }

    if (this.cleanupInProgress) {
      throw new Error('Cleanup already in progress');
    }

    this.cleanupInProgress = true;
    const startTime = Date.now();
    const result: CleanupResult = {
      policy: policyName,
      deletedDocuments: 0,
      deletedChunks: 0,
      freedSpace: 0,
      duration: 0,
      errors: []
    };

    try {
      logger.info(`Executing retention policy: ${policyName}`);
      metrics.increment('retention.policy.started', { policy: policyName });

      switch (policyName) {
        case 'old_documents':
          await this.cleanupOldDocuments(policy, result);
          break;
        case 'large_repositories':
          await this.cleanupLargeRepositories(policy, result);
          break;
        case 'document_limit':
          await this.enforceDocumentLimit(policy, result);
          break;
        case 'orphaned_chunks':
          await this.cleanupOrphanedChunks(result);
          break;
        default:
          if (policy.maxAge || policy.maxSize || policy.maxDocuments) {
            await this.executeCustomPolicy(policy, result);
          }
      }

      result.duration = Date.now() - startTime;
      
      logger.info(`Retention policy completed: ${policyName}`, { result });
      metrics.increment('retention.policy.completed', { policy: policyName });
      metrics.gauge('retention.documents.deleted', result.deletedDocuments);
      metrics.gauge('retention.chunks.deleted', result.deletedChunks);
      metrics.gauge('retention.space.freed', result.freedSpace);

      return result;
    } finally {
      this.cleanupInProgress = false;
    }
  }

  private async cleanupOldDocuments(policy: RetentionPolicy, result: CleanupResult): Promise<void> {
    if (!policy.maxAge) return;

    const cutoffDate = new Date(Date.now() - policy.maxAge);
    
    try {
      const collections = await this.vectorStore.listCollections();
      
      for (const collection of collections) {
        const oldPoints = await this.vectorStore.scroll(collection, {
          filter: {
            must: [{
              key: 'indexed_at',
              range: {
                lt: cutoffDate.toISOString()
              }
            }]
          }
        });

        if (oldPoints.length > 0) {
          const pointIds = oldPoints.map(p => p.id);
          await this.vectorStore.deletePoints(collection, pointIds);
          
          result.deletedChunks += pointIds.length;
          logger.info(`Deleted ${pointIds.length} old chunks from ${collection}`);
        }
      }
    } catch (error) {
      result.errors.push(`Failed to cleanup old documents: ${error}`);
      logger.error('Failed to cleanup old documents', { error });
    }
  }

  private async cleanupLargeRepositories(policy: RetentionPolicy, result: CleanupResult): Promise<void> {
    if (!policy.maxSize) return;

    try {
      const repoSizes = await this.calculateRepositorySizes();
      
      for (const [repo, size] of repoSizes.entries()) {
        if (size > policy.maxSize) {
          const excess = size - policy.maxSize;
          const percentToDelete = excess / size;
          
          const collections = await this.vectorStore.listCollections();
          for (const collection of collections) {
            const repoPoints = await this.vectorStore.scroll(collection, {
              filter: {
                must: [{
                  key: 'repository',
                  match: { value: repo }
                }]
              }
            });

            const pointsToDelete = Math.floor(repoPoints.length * percentToDelete);
            if (pointsToDelete > 0) {
              // Delete oldest points first
              const sortedPoints = repoPoints.sort((a, b) => {
                const dateA = new Date((a as any).payload?.indexed_at || 0).getTime();
                const dateB = new Date((b as any).payload?.indexed_at || 0).getTime();
                return dateA - dateB;
              });

              const idsToDelete = sortedPoints.slice(0, pointsToDelete).map(p => p.id);
              await this.vectorStore.deletePoints(collection, idsToDelete);
              
              result.deletedChunks += idsToDelete.length;
              result.freedSpace += excess;
            }
          }
          
          logger.info(`Cleaned up large repository: ${repo}`, { 
            originalSize: size, 
            freedSpace: excess 
          });
        }
      }
    } catch (error) {
      result.errors.push(`Failed to cleanup large repositories: ${error}`);
      logger.error('Failed to cleanup large repositories', { error });
    }
  }

  private async enforceDocumentLimit(policy: RetentionPolicy, result: CleanupResult): Promise<void> {
    if (!policy.maxDocuments) return;

    try {
      const collections = await this.vectorStore.listCollections();
      
      for (const collection of collections) {
        const info = await this.vectorStore.getCollectionInfo(collection);
        
        if (info.vectors_count > policy.maxDocuments) {
          const excess = info.vectors_count - policy.maxDocuments;
          
          // Get oldest documents
          const oldestPoints = await this.vectorStore.scroll(collection, {
            limit: excess,
            order_by: [{ key: 'indexed_at', direction: 'asc' }]
          });

          if (oldestPoints.length > 0) {
            const idsToDelete = oldestPoints.map(p => p.id);
            await this.vectorStore.deletePoints(collection, idsToDelete);
            
            result.deletedChunks += idsToDelete.length;
            logger.info(`Enforced document limit on ${collection}`, { 
              deleted: excess,
              remaining: policy.maxDocuments 
            });
          }
        }
      }
    } catch (error) {
      result.errors.push(`Failed to enforce document limit: ${error}`);
      logger.error('Failed to enforce document limit', { error });
    }
  }

  private async cleanupOrphanedChunks(result: CleanupResult): Promise<void> {
    try {
      const collections = await this.vectorStore.listCollections();
      const validFiles = await this.getValidFiles();
      
      for (const collection of collections) {
        const allPoints = await this.vectorStore.scroll(collection, { limit: 1000 });
        
        for (const point of allPoints) {
          const filepath = point.payload?.filepath;
          if (filepath && !validFiles.has(filepath)) {
            await this.vectorStore.deletePoints(collection, [point.id]);
            result.deletedChunks++;
          }
        }
      }
      
      logger.info(`Cleaned up ${result.deletedChunks} orphaned chunks`);
    } catch (error) {
      result.errors.push(`Failed to cleanup orphaned chunks: ${error}`);
      logger.error('Failed to cleanup orphaned chunks', { error });
    }
  }

  private async executeCustomPolicy(policy: RetentionPolicy, result: CleanupResult): Promise<void> {
    // Custom policy implementation combining multiple criteria
    const collections = await this.vectorStore.listCollections();
    
    for (const collection of collections) {
      const filter: any = { must: [] };
      
      if (policy.maxAge) {
        const cutoffDate = new Date(Date.now() - policy.maxAge);
        filter.must.push({
          key: 'indexed_at',
          range: { lt: cutoffDate.toISOString() }
        });
      }
      
      const pointsToDelete = await this.vectorStore.scroll(collection, { filter });
      
      if (pointsToDelete.length > 0) {
        const idsToDelete = pointsToDelete.map(p => p.id);
        await this.vectorStore.deletePoints(collection, idsToDelete);
        result.deletedChunks += idsToDelete.length;
      }
    }
  }

  private async calculateRepositorySizes(): Promise<Map<string, number>> {
    const sizes = new Map<string, number>();
    
    try {
      const dataPath = path.resolve(this.dataDir);
      const repos = await fs.readdir(dataPath);
      
      for (const repo of repos) {
        const repoPath = path.join(dataPath, repo);
        const stat = await fs.stat(repoPath);
        
        if (stat.isDirectory()) {
          const size = await this.getDirectorySize(repoPath);
          sizes.set(repo, size);
        }
      }
    } catch (error) {
      logger.error('Failed to calculate repository sizes', { error });
    }
    
    return sizes;
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      
      if (file.isDirectory()) {
        size += await this.getDirectorySize(filePath);
      } else {
        const stat = await fs.stat(filePath);
        size += stat.size;
      }
    }
    
    return size;
  }

  private async getValidFiles(): Promise<Set<string>> {
    const validFiles = new Set<string>();
    
    try {
      const dataPath = path.resolve(this.dataDir);
      await this.scanDirectory(dataPath, validFiles);
    } catch (error) {
      logger.error('Failed to get valid files', { error });
    }
    
    return validFiles;
  }

  private async scanDirectory(dirPath: string, validFiles: Set<string>): Promise<void> {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      
      if (file.isDirectory()) {
        await this.scanDirectory(filePath, validFiles);
      } else {
        validFiles.add(filePath);
      }
    }
  }

  async getRetentionStatus(): Promise<{
    policies: RetentionPolicy[];
    lastCleanup: Record<string, Date>;
    nextScheduled: Record<string, Date>;
    stats: {
      totalDocuments: number;
      totalSize: number;
      oldestDocument: Date | null;
    };
  }> {
    const lastCleanup: Record<string, Date> = {};
    const nextScheduled: Record<string, Date> = {};
    
    // Get collection stats
    let totalDocuments = 0;
    let oldestDocument: Date | null = null;
    
    try {
      const collections = await this.vectorStore.listCollections();
      
      for (const collection of collections) {
        const info = await this.vectorStore.getCollectionInfo(collection);
        totalDocuments += info.vectors_count;
        
        // Find oldest document
        const oldest = await this.vectorStore.scroll(collection, {
          limit: 1,
          order_by: [{ key: 'indexed_at', direction: 'asc' }]
        });
        
        if (oldest.length > 0 && oldest[0].payload?.indexed_at) {
          const date = new Date(oldest[0].payload.indexed_at);
          if (!oldestDocument || date < oldestDocument) {
            oldestDocument = date;
          }
        }
      }
    } catch (error) {
      logger.error('Failed to get retention stats', { error });
    }
    
    const repoSizes = await this.calculateRepositorySizes();
    const totalSize = Array.from(repoSizes.values()).reduce((sum, size) => sum + size, 0);
    
    return {
      policies: Array.from(this.policies.values()),
      lastCleanup,
      nextScheduled,
      stats: {
        totalDocuments,
        totalSize,
        oldestDocument
      }
    };
  }

  stopAllScheduledJobs(): void {
    for (const [name, job] of this.scheduledJobs.entries()) {
      job.stop();
      logger.info(`Stopped scheduled retention job: ${name}`);
    }
    this.scheduledJobs.clear();
  }
}