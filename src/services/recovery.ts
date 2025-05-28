import { VectorStore } from './vector-store';
import { GitSyncService } from './git-sync';
import { DocumentProcessor } from './document-processor';
import { EmbeddingService } from './embedding';
import { logger } from "../utils/logger-stub"
import { metrics } from './metrics';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface RecoveryCheckpoint {
  id: string;
  timestamp: Date;
  type: 'sync' | 'index' | 'embed';
  repository?: string;
  status: 'started' | 'completed' | 'failed';
  metadata: Record<string, any>;
}

export interface RecoveryStatus {
  inProgress: boolean;
  currentOperation?: string;
  progress: number;
  totalSteps: number;
  errors: string[];
  startTime?: Date;
  estimatedCompletion?: Date;
}

export class RecoveryService {
  private checkpoints: Map<string, RecoveryCheckpoint> = new Map();
  private recoveryInProgress = false;
  private checkpointFile: string;
  private stateFile: string;

  constructor(
    private vectorStore: VectorStore,
    private gitSync: GitSyncService,
    private documentProcessor: DocumentProcessor,
    private embeddingService: EmbeddingService,
    private dataDir: string = './data'
  ) {
    this.checkpointFile = path.join(dataDir, '.recovery', 'checkpoints.json');
    this.stateFile = path.join(dataDir, '.recovery', 'state.json');
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.checkpointFile), { recursive: true });
      await this.loadCheckpoints();
    } catch (error) {
      logger.error('Failed to initialize recovery service', { error });
    }
  }

  private async loadCheckpoints(): Promise<void> {
    try {
      const data = await fs.readFile(this.checkpointFile, 'utf-8');
      const checkpoints = JSON.parse(data);
      
      for (const checkpoint of checkpoints) {
        this.checkpoints.set(checkpoint.id, {
          ...checkpoint,
          timestamp: new Date(checkpoint.timestamp)
        });
      }
      
      logger.info(`Loaded ${this.checkpoints.size} recovery checkpoints`);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.error('Failed to load checkpoints', { error });
      }
    }
  }

  private async saveCheckpoints(): Promise<void> {
    try {
      const checkpoints = Array.from(this.checkpoints.values());
      await fs.writeFile(this.checkpointFile, JSON.stringify(checkpoints, null, 2));
    } catch (error) {
      logger.error('Failed to save checkpoints', { error });
    }
  }

  async createCheckpoint(
    type: RecoveryCheckpoint['type'],
    repository?: string,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const checkpoint: RecoveryCheckpoint = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      repository,
      status: 'started',
      metadata
    };

    this.checkpoints.set(checkpoint.id, checkpoint);
    await this.saveCheckpoints();
    
    logger.info('Created recovery checkpoint', { checkpoint });
    metrics.increment('recovery.checkpoint.created', { type });
    
    return checkpoint.id;
  }

  async updateCheckpoint(id: string, status: RecoveryCheckpoint['status'], metadata?: Record<string, any>): Promise<void> {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${id}`);
    }

    checkpoint.status = status;
    if (metadata) {
      checkpoint.metadata = { ...checkpoint.metadata, ...metadata };
    }

    await this.saveCheckpoints();
    
    logger.info('Updated recovery checkpoint', { checkpoint });
    metrics.increment('recovery.checkpoint.updated', { 
      type: checkpoint.type,
      status 
    });
  }

  async recover(): Promise<void> {
    if (this.recoveryInProgress) {
      throw new Error('Recovery already in progress');
    }

    this.recoveryInProgress = true;
    const startTime = Date.now();
    
    try {
      logger.info('Starting recovery process');
      metrics.increment('recovery.started');

      // Find incomplete checkpoints
      const incompleteCheckpoints = Array.from(this.checkpoints.values())
        .filter(cp => cp.status === 'started')
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      if (incompleteCheckpoints.length === 0) {
        logger.info('No incomplete operations found');
        return;
      }

      logger.info(`Found ${incompleteCheckpoints.length} incomplete operations`);

      for (const checkpoint of incompleteCheckpoints) {
        try {
          await this.recoverCheckpoint(checkpoint);
          await this.updateCheckpoint(checkpoint.id, 'completed');
        } catch (error) {
          logger.error('Failed to recover checkpoint', { checkpoint, error });
          await this.updateCheckpoint(checkpoint.id, 'failed', { error: String(error) });
        }
      }

      const duration = Date.now() - startTime;
      logger.info('Recovery process completed', { duration });
      metrics.histogram('recovery.duration', duration);
      metrics.increment('recovery.completed');
    } catch (error) {
      logger.error('Recovery process failed', { error });
      metrics.increment('recovery.failed');
      throw error;
    } finally {
      this.recoveryInProgress = false;
    }
  }

  private async recoverCheckpoint(checkpoint: RecoveryCheckpoint): Promise<void> {
    logger.info(`Recovering checkpoint: ${checkpoint.type}`, { checkpoint });

    switch (checkpoint.type) {
      case 'sync':
        await this.recoverSync(checkpoint);
        break;
      case 'index':
        await this.recoverIndexing(checkpoint);
        break;
      case 'embed':
        await this.recoverEmbedding(checkpoint);
        break;
      default:
        logger.warn(`Unknown checkpoint type: ${checkpoint.type}`);
    }
  }

  private async recoverSync(checkpoint: RecoveryCheckpoint): Promise<void> {
    if (!checkpoint.repository) {
      throw new Error('Repository not specified in sync checkpoint');
    }

    const repos = this.gitSync.getRepositories();
    const repo = repos.find(r => r.name === checkpoint.repository);
    if (!repo) {
      throw new Error(`Repository not found: ${checkpoint.repository}`);
    }

    logger.info(`Recovering sync for repository: ${checkpoint.repository}`);
    await this.gitSync.syncRepository(repo);
  }

  private async recoverIndexing(checkpoint: RecoveryCheckpoint): Promise<void> {
    const { filepath, repository } = checkpoint.metadata;
    if (!filepath || !repository) {
      throw new Error('Missing filepath or repository in indexing checkpoint');
    }

    logger.info(`Recovering indexing for file: ${filepath}`);
    
    const content = await fs.readFile(filepath, 'utf-8');
    const result = await this.documentProcessor.processDocument(filepath, content, {
      name: repository,
      url: '',
      branch: 'main'
    });

    if (result.chunks.length > 0) {
      const chunksWithEmbeddings = await this.embeddingService.generateChunkEmbeddings(result.chunks);
      await this.vectorStore.upsertChunks(chunksWithEmbeddings);
    }
  }

  private async recoverEmbedding(checkpoint: RecoveryCheckpoint): Promise<void> {
    const { chunkIds, collection } = checkpoint.metadata;
    if (!chunkIds || !collection) {
      throw new Error('Missing chunkIds or collection in embedding checkpoint');
    }

    logger.info(`Recovering embeddings for ${chunkIds.length} chunks`);
    
    // Re-generate embeddings for the specified chunks
    // This would need to be implemented in VectorStore
    const chunks: any[] = [];
    if (chunks.length > 0) {
      const chunksWithEmbeddings = await this.embeddingService.generateChunkEmbeddings(chunks);
      await this.vectorStore.upsertChunks(chunksWithEmbeddings);
    }
  }

  async getRecoveryStatus(): Promise<RecoveryStatus> {
    const incompleteCheckpoints = Array.from(this.checkpoints.values())
      .filter(cp => cp.status === 'started');

    return {
      inProgress: this.recoveryInProgress,
      currentOperation: this.recoveryInProgress ? 'Recovering...' : undefined,
      progress: 0,
      totalSteps: incompleteCheckpoints.length,
      errors: incompleteCheckpoints
        .filter(cp => cp.status === 'failed')
        .map(cp => cp.metadata.error || 'Unknown error'),
      startTime: this.recoveryInProgress ? new Date() : undefined
    };
  }

  async saveState(state: Record<string, any>): Promise<void> {
    try {
      await fs.writeFile(this.stateFile, JSON.stringify({
        ...state,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      logger.debug('Saved recovery state', { state });
    } catch (error) {
      logger.error('Failed to save recovery state', { error });
    }
  }

  async loadState(): Promise<Record<string, any> | null> {
    try {
      const data = await fs.readFile(this.stateFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.error('Failed to load recovery state', { error });
      }
      return null;
    }
  }

  async cleanupOldCheckpoints(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const cutoffDate = new Date(Date.now() - maxAge);
    let deleted = 0;

    for (const [id, checkpoint] of this.checkpoints.entries()) {
      if (checkpoint.timestamp < cutoffDate && checkpoint.status !== 'started') {
        this.checkpoints.delete(id);
        deleted++;
      }
    }

    if (deleted > 0) {
      await this.saveCheckpoints();
      logger.info(`Cleaned up ${deleted} old checkpoints`);
      metrics.increment('recovery.checkpoints.cleaned', { count: String(deleted) });
    }
  }

  async createBackup(name?: string): Promise<string> {
    const backupName = name || `backup_${Date.now()}`;
    const backupDir = path.join(this.dataDir, '.backups', backupName);

    try {
      await fs.mkdir(backupDir, { recursive: true });

      // Backup vector store data
      // This would need to be implemented in VectorStore
      const collections: string[] = [];
      for (const collection of collections) {
        // This would need to be implemented in VectorStore
        const data = {};
        await fs.writeFile(
          path.join(backupDir, `${collection}.json`),
          JSON.stringify(data, null, 2)
        );
      }

      // Backup checkpoints
      await fs.copyFile(
        this.checkpointFile,
        path.join(backupDir, 'checkpoints.json')
      );

      // Backup state
      if (await this.fileExists(this.stateFile)) {
        await fs.copyFile(
          this.stateFile,
          path.join(backupDir, 'state.json')
        );
      }

      // Create backup metadata
      await fs.writeFile(
        path.join(backupDir, 'metadata.json'),
        JSON.stringify({
          name: backupName,
          timestamp: new Date().toISOString(),
          collections: collections.length,
          checkpoints: this.checkpoints.size
        }, null, 2)
      );

      logger.info(`Created backup: ${backupName}`);
      metrics.increment('recovery.backup.created');
      
      return backupName;
    } catch (error) {
      logger.error('Failed to create backup', { error });
      metrics.increment('recovery.backup.failed');
      throw error;
    }
  }

  async restoreBackup(name: string): Promise<void> {
    const backupDir = path.join(this.dataDir, '.backups', name);

    try {
      // Verify backup exists
      const metadata = JSON.parse(
        await fs.readFile(path.join(backupDir, 'metadata.json'), 'utf-8')
      );

      logger.info(`Restoring backup: ${name}`, { metadata });

      // Restore vector store data
      const files = await fs.readdir(backupDir);
      const collectionFiles = files.filter(f => f.endsWith('.json') && f !== 'metadata.json');

      for (const file of collectionFiles) {
        // const collection = file.replace('.json', '');
        // const data = JSON.parse(
        //   await fs.readFile(path.join(backupDir, file), 'utf-8')
        // );
        
        // This would need to be implemented in VectorStore
        logger.info(`Found backup file: ${file}`);
      }

      // Restore checkpoints
      if (await this.fileExists(path.join(backupDir, 'checkpoints.json'))) {
        await fs.copyFile(
          path.join(backupDir, 'checkpoints.json'),
          this.checkpointFile
        );
        await this.loadCheckpoints();
      }

      // Restore state
      if (await this.fileExists(path.join(backupDir, 'state.json'))) {
        await fs.copyFile(
          path.join(backupDir, 'state.json'),
          this.stateFile
        );
      }

      logger.info(`Restored backup: ${name}`);
      metrics.increment('recovery.backup.restored');
    } catch (error) {
      logger.error('Failed to restore backup', { error });
      metrics.increment('recovery.backup.restore_failed');
      throw error;
    }
  }

  private async fileExists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  async listBackups(): Promise<Array<{
    name: string;
    timestamp: Date;
    size: number;
    metadata: any;
  }>> {
    const backupsDir = path.join(this.dataDir, '.backups');
    
    try {
      const backups = await fs.readdir(backupsDir);
      const backupInfo = [];

      for (const backup of backups) {
        try {
          const metadata = JSON.parse(
            await fs.readFile(path.join(backupsDir, backup, 'metadata.json'), 'utf-8')
          );
          
          // const stats = await fs.stat(path.join(backupsDir, backup));
          
          backupInfo.push({
            name: backup,
            timestamp: new Date(metadata.timestamp),
            size: await this.getDirectorySize(path.join(backupsDir, backup)),
            metadata
          });
        } catch (error) {
          logger.warn(`Failed to read backup metadata: ${backup}`, { error });
        }
      }

      return backupInfo.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.error('Failed to list backups', { error });
      }
      return [];
    }
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
}