import { QdrantClient } from '@qdrant/js-client-rest';
import { DocumentChunk } from '../types/document';
import { VectorStoreConfig } from '../types/config';
import { PerformanceMonitorService } from './performance-monitor';
import logger from '../utils/logger';
import { VectorStoreError } from '../utils/errors';
import { retry, retryStrategies, withTimeout } from '../utils/retry';
import { RateLimiter } from '../utils/security';
import { v5 as uuidv5 } from 'uuid';

export interface SearchOptions {
  limit?: number;
  scoreThreshold?: number;
  filter?: Record<string, any>;
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

export interface VectorStoreStats {
  totalDocuments: number;
  totalChunks: number;
  collectionSize: number;
}

export class VectorStore {
  private client: QdrantClient;
  private collectionName: string;
  private vectorSize: number;
  private initialized: boolean = false;
  private searchRateLimiter: RateLimiter;
  private upsertRateLimiter: RateLimiter;
  private performanceMonitor?: PerformanceMonitorService;
  private consecutiveFailures: number = 0;
  private lastFailureTime: number = 0;
  private readonly maxConsecutiveFailures = 5;
  private readonly circuitBreakerTimeout = 60000; // 1 minute

  constructor(config: VectorStoreConfig, vectorSize: number = 384, performanceMonitor?: PerformanceMonitorService) {
    if (config.type !== 'qdrant') {
      throw new VectorStoreError('Only Qdrant vector store is currently supported');
    }

    const qdrantConfig = config.qdrant || {};
    this.client = new QdrantClient({
      url: qdrantConfig.url || 'http://localhost:6333',
    });
    
    this.collectionName = qdrantConfig.collectionName || 'documentation';
    this.vectorSize = vectorSize;
    
    // Initialize rate limiters
    this.searchRateLimiter = new RateLimiter(30, 60000); // 30 searches per minute
    this.upsertRateLimiter = new RateLimiter(100, 60000); // 100 upserts per minute
    
    this.performanceMonitor = performanceMonitor;
    
    // Cleanup rate limiter periodically
    const cleanupInterval = setInterval(() => {
      this.searchRateLimiter.cleanup();
      this.upsertRateLimiter.cleanup();
    }, 300000); // Every 5 minutes
    
    // Don't keep the process alive just for cleanup
    cleanupInterval.unref();
  }

  // Qdrant namespace UUID for consistent ID generation
  private readonly QDRANT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  private convertToQdrantId(stringId: string): string {
    // Convert string ID to UUID format for Qdrant compatibility
    return uuidv5(stringId, this.QDRANT_NAMESPACE);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await retry(async () => {
        const collections = await withTimeout(
          this.client.getCollections(),
          10000,
          new Error('Vector store connection timeout')
        );
        const exists = collections.collections.some(
          c => c.name === this.collectionName
        );

        if (!exists) {
          await this.createCollection();
        } else {
          logger.info(`Collection ${this.collectionName} already exists`);
        }
      }, retryStrategies.vectorStore);

      this.initialized = true;
      logger.info('Vector store initialized successfully');
    } catch (error) {
      throw new VectorStoreError('Failed to initialize vector store', { error });
    }
  }

  private async createCollection(): Promise<void> {
    logger.info(`Creating collection: ${this.collectionName}`);

    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: this.vectorSize,
        distance: 'Cosine',
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });

    // Field indexes would be created here if supported by the Qdrant client
    // The current client version may not have createFieldIndex method

    logger.info(`Collection ${this.collectionName} created successfully`);
  }

  async upsertChunks(chunks: DocumentChunk[]): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (chunks.length === 0) {
      return;
    }

    // Circuit breaker check
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure < this.circuitBreakerTimeout) {
        logger.warn('Circuit breaker open, skipping upsert operation', {
          consecutiveFailures: this.consecutiveFailures,
          timeSinceLastFailure,
          timeout: this.circuitBreakerTimeout
        });
        return; // Skip this operation
      } else {
        logger.info('Circuit breaker timeout expired, attempting to reset');
        this.consecutiveFailures = 0;
      }
    }

    const points = chunks
      .filter(chunk => {
        if (!chunk.embedding || chunk.embedding.length === 0) {
          logger.warn(`Chunk ${chunk.id} has no embedding, skipping`);
          return false;
        }
        if (chunk.embedding.length !== this.vectorSize) {
          logger.warn(`Chunk ${chunk.id} has incorrect vector size: ${chunk.embedding.length}, expected: ${this.vectorSize}`);
          return false;
        }
        return true;
      })
      .map(chunk => ({
        id: this.convertToQdrantId(chunk.id),
        vector: chunk.embedding!,
        payload: {
          originalId: chunk.id,
          documentId: chunk.documentId,
          repository: chunk.repository,
          filepath: chunk.filepath,
          content: chunk.content.substring(0, 32000), // Limit content size
          type: chunk.type,
          metadata: {
            ...chunk.metadata,
            title: chunk.metadata.title?.substring(0, 1000) || undefined
          },
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          parentChunkId: chunk.parentChunkId,
          childChunkIds: chunk.childChunkIds?.slice(0, 100), // Limit array size
          hash: chunk.hash,
          priority: chunk.metadata.priority || 'medium',
        },
      }));

    if (points.length === 0) {
      logger.warn('No valid chunks with embeddings to upsert');
      return;
    }

    // Check Qdrant connectivity first (with fallback)
    try {
      await this.healthCheck();
    } catch (error) {
      logger.warn('Qdrant health check failed, attempting fallback', { error });
      
      // Try a fallback approach - attempt to continue anyway
      try {
        // Check if collection exists as a simpler test
        const _collectionInfo = await withTimeout(
          this.client.getCollection(this.collectionName),
          2000,
          new Error('Collection check timeout')
        );
        logger.info('Qdrant fallback check passed', { collection: this.collectionName });
      } catch (fallbackError) {
        logger.error('Qdrant connectivity check failed completely', { 
          healthCheckError: error,
          fallbackError
        });
        throw new VectorStoreError('Qdrant is not accessible', { originalError: error });
      }
    }

    try {
      // Use smaller batch size for better reliability
      const batchSize = 10;
      let successfulBatches = 0;
      let failedBatches = 0;
      
      logger.info(`Upserting ${points.length} points in batches of ${batchSize}`);
      
      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(points.length / batchSize);
        
        try {
          // Check performance throttling
          if (this.performanceMonitor?.shouldThrottle()) {
            const throttleLevel = this.performanceMonitor.getThrottlingLevel();
            const delay = throttleLevel === 'heavy' ? 3000 : 1000;
            logger.info(`Throttling batch ${batchNumber}/${totalBatches} due to ${throttleLevel} resource usage`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // Check rate limit
          if (!this.upsertRateLimiter.check('upsert')) {
            logger.warn(`Rate limit hit for batch ${batchNumber}/${totalBatches}, waiting...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          await this.upsertBatch(batch, batchNumber, totalBatches);
          successfulBatches++;
          
          if (this.performanceMonitor) {
            this.performanceMonitor.updateApplicationMetrics({ chunksProcessed: batch.length });
          }

          // Progressive delay to reduce server load
          const delay = Math.min(200 + (batchNumber * 50), 1000);
          if (i + batchSize < points.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
        } catch (error) {
          failedBatches++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to upsert batch ${batchNumber}/${totalBatches}`, {
            error: errorMessage,
            batchSize: batch.length
          });
          
          // Continue with next batch instead of failing completely
          // Only fail if more than 50% of batches fail
          if (failedBatches > Math.max(2, totalBatches * 0.5)) {
            logger.error(`Too many batch failures, stopping`, {
              failedBatches,
              totalBatches,
              successfulBatches
            });
            throw new VectorStoreError(`Too many batch failures: ${failedBatches}/${totalBatches}`);
          }
          
          // Add delay after failed batch to help with recovery
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      logger.info(`Upsert completed: ${successfulBatches} successful, ${failedBatches} failed batches`);
      
      // Update circuit breaker state based on results
      if (failedBatches === 0) {
        // Complete success - reset circuit breaker
        this.consecutiveFailures = 0;
      } else if (failedBatches > successfulBatches) {
        // More failures than successes - increment failure count
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();
        logger.warn('Vector upsert had more failures than successes', {
          consecutiveFailures: this.consecutiveFailures,
          failedBatches,
          successfulBatches
        });
      }
      
    } catch (error) {
      // Complete failure - update circuit breaker
      this.consecutiveFailures++;
      this.lastFailureTime = Date.now();
      
      logger.error('Vector upsert failed completely', { 
        error,
        consecutiveFailures: this.consecutiveFailures
      });
      throw new VectorStoreError('Failed to upsert chunks', {
        originalError: error,
        chunksCount: chunks.length,
        pointsCount: points.length
      });
    }
  }

  private async upsertBatch(batch: any[], batchNumber: number, totalBatches: number): Promise<void> {
    await retry(async () => {
      await withTimeout(
        this.client.upsert(this.collectionName, {
          wait: true,
          points: batch,
        }),
        20000, // Reduced timeout
        new Error(`Batch ${batchNumber}/${totalBatches} timeout`)
      );
    }, {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2,
      onRetry: (error, attempt) => {
        logger.warn(`Retrying batch ${batchNumber}/${totalBatches}`, {
          attempt,
          error: error.message.substring(0, 200),
          batchSize: batch.length
        });
      }
    });
  }

  private async healthCheck(): Promise<void> {
    try {
      // Try a simple collections call first
      const result = await withTimeout(
        this.client.getCollections(),
        3000,
        new Error('Qdrant health check timeout')
      );
      
      // Verify the response is valid
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response from Qdrant');
      }
      
      logger.debug('Qdrant health check passed', { collections: result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Qdrant health check failed', { 
        error: errorMessage
      });
      throw new VectorStoreError('Qdrant health check failed', { originalError: error });
    }
  }

  async search(
    embedding: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.performanceMonitor) {
      this.performanceMonitor.updateApplicationMetrics({ searchRequests: 1 });
    }

    const {
      limit = 20,
      scoreThreshold = 0.5,
      filter = {},
    } = options;

    try {
      // Check performance throttling
      if (this.performanceMonitor?.shouldThrottle()) {
        const throttleLevel = this.performanceMonitor.getThrottlingLevel();
        const delay = throttleLevel === 'heavy' ? 2000 : 1000;
        logger.info(`Throttling search operations due to ${throttleLevel} resource usage, delaying ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Check rate limit
      if (!this.searchRateLimiter.check('search')) {
        logger.warn('Search rate limit exceeded');
        throw new VectorStoreError('Rate limit exceeded for vector search');
      }
      
      const searchParams: any = {
        vector: embedding,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
      };

      if (Object.keys(filter).length > 0) {
        searchParams.filter = this.buildFilter(filter);
      }

      const results = await retry(async () => {
        return await withTimeout(
          this.client.search(this.collectionName, searchParams),
          15000,
          new Error('Vector search timeout')
        );
      }, retryStrategies.vectorStore);

      return results.map(result => ({
        chunk: this.payloadToChunk(result.id as string, result.payload || {}),
        score: result.score,
      }));
    } catch (error) {
      throw new VectorStoreError('Search failed', { error });
    }
  }

  async searchByMetadata(
    filter: Record<string, any>,
    limit: number = 100
  ): Promise<DocumentChunk[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Check rate limit
      if (!this.searchRateLimiter.check('metadata-search')) {
        logger.warn('Metadata search rate limit exceeded');
        throw new VectorStoreError('Rate limit exceeded for metadata search');
      }
      
      const results = await retry(async () => {
        // Use search instead of scroll for metadata queries
        return await this.client.search(this.collectionName, {
          vector: Array(this.vectorSize).fill(0), // Dummy vector for metadata-only search
          filter: this.buildFilter(filter),
          limit,
          with_payload: true,
          score_threshold: 0.0, // Accept all results based on metadata
        });
      });

      return results.map((point: any) =>
        this.payloadToChunk(point.id as string, point.payload || {})
      );
    } catch (error) {
      throw new VectorStoreError('Metadata search failed', { error });
    }
  }

  async deleteByRepository(repository: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await retry(async () => {
        await this.client.delete(this.collectionName, {
          wait: true,
          filter: {
            must: [
              {
                key: 'repository',
                match: { value: repository },
              },
            ],
          },
        });
      });

      logger.info(`Deleted all chunks for repository: ${repository}`);
    } catch (error) {
      throw new VectorStoreError(`Failed to delete chunks for repository ${repository}`, {
        error,
      });
    }
  }

  async deleteByDocument(documentId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await retry(async () => {
        await this.client.delete(this.collectionName, {
          wait: true,
          filter: {
            must: [
              {
                key: 'documentId',
                match: { value: documentId },
              },
            ],
          },
        });
      });

      logger.info(`Deleted all chunks for document: ${documentId}`);
    } catch (error) {
      throw new VectorStoreError(`Failed to delete chunks for document ${documentId}`, {
        error,
      });
    }
  }

  async getStats(): Promise<VectorStoreStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const collectionInfo = await withTimeout(
        this.client.getCollection(this.collectionName),
        5000,
        new Error('Collection info timeout')
      );
      
      // Fast stats - just use collection info without scanning points
      const pointsCount = collectionInfo.points_count || 0;
      const estimatedDocs = Math.max(1, Math.floor(pointsCount / 10)); // Rough estimate

      return {
        totalDocuments: estimatedDocs,
        totalChunks: pointsCount,
        collectionSize: collectionInfo.indexed_vectors_count || 0,
      };
    } catch (error) {
      logger.error('Failed to get stats', { error });
      // Return minimal stats if error
      return {
        totalDocuments: 0,
        totalChunks: 0,
        collectionSize: 0,
      };
    }
  }

  private buildFilter(filter: Record<string, any>): any {
    const must: any[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (Array.isArray(value)) {
        must.push({
          key,
          match: { any: value },
        });
      } else if (value !== null && value !== undefined) {
        must.push({
          key,
          match: { value },
        });
      }
    }

    return must.length > 0 ? { must } : undefined;
  }

  private payloadToChunk(id: string, payload: Record<string, any>): DocumentChunk {
    return {
      id: payload.originalId || id,  // Use original ID if available
      documentId: payload.documentId,
      repository: payload.repository,
      filepath: payload.filepath,
      content: payload.content,
      type: payload.type,
      metadata: payload.metadata || {},
      startLine: payload.startLine,
      endLine: payload.endLine,
      parentChunkId: payload.parentChunkId,
      childChunkIds: payload.childChunkIds,
      hash: payload.hash,
    };
  }

  async clear(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await this.client.deleteCollection(this.collectionName);
      await this.createCollection();
      logger.info(`Cleared collection: ${this.collectionName}`);
    } catch (error) {
      throw new VectorStoreError('Failed to clear collection', { error });
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const collections = await this.client.getCollections();
      return collections.collections.map(c => c.name);
    } catch (error) {
      throw new VectorStoreError('Failed to list collections', { error });
    }
  }

  async deletePoints(collectionName: string, pointIds: string[]): Promise<void> {
    try {
      await retry(async () => {
        await this.client.delete(collectionName, {
          wait: true,
          points: pointIds,
        });
      });
      logger.info(`Deleted ${pointIds.length} points from collection: ${collectionName}`);
    } catch (error) {
      throw new VectorStoreError('Failed to delete points', { error });
    }
  }

  async scroll(
    collectionName: string,
    options: {
      limit?: number;
      offset?: number;
      filter?: any;
      with_payload?: boolean | string[];
      order_by?: Array<{ key: string; direction: 'asc' | 'desc' }>;
    } = {}
  ): Promise<any[]> {
    try {
      const scrollParams: any = {
        limit: options.limit || 100,
        with_payload: options.with_payload !== undefined ? options.with_payload : true,
      };

      if (options.offset !== undefined) {
        scrollParams.offset = options.offset;
      }

      if (options.filter) {
        scrollParams.filter = options.filter;
      }

      if (options.order_by) {
        scrollParams.order_by = options.order_by;
      }

      const results = await retry(async () => {
        return await this.client.scroll(collectionName, scrollParams);
      });

      return results.points;
    } catch (error) {
      throw new VectorStoreError('Failed to scroll collection', { error });
    }
  }

  async getCollectionInfo(collectionName: string): Promise<any> {
    try {
      return await this.client.getCollection(collectionName);
    } catch (error) {
      throw new VectorStoreError('Failed to get collection info', { error });
    }
  }

}

export default VectorStore;