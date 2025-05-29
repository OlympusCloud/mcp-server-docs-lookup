/**
 * Service Manager - Coordinates all services
 */
import { ConfigLoader } from '../utils/config-loader';
import { GitSyncService } from '../services/git-sync';
import { DocumentProcessor } from '../services/document-processor';
import { VectorStore } from '../services/vector-store';
import { EmbeddingService, EmbeddingProvider } from '../services/embedding';
import { ContextGenerator } from '../services/context-generator';
import { PerformanceMonitorService } from '../services/performance-monitor';
import logger from '../utils/logger';

export class ServiceManager {
  private configLoader: ConfigLoader;
  private gitSync: GitSyncService;
  private documentProcessor: DocumentProcessor;
  private vectorStore!: VectorStore;
  private embeddingService!: EmbeddingService;
  private contextGenerator!: ContextGenerator;
  private performanceMonitor!: PerformanceMonitorService;
  private initialized: boolean = false;

  constructor() {
    this.configLoader = new ConfigLoader();
    this.gitSync = new GitSyncService();
    this.documentProcessor = new DocumentProcessor();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      logger.info('Initializing services...');
      
      // Load configuration
      const config = await this.configLoader.loadConfig();
      logger.info(`Loaded configuration for ${config.repositories.length} repositories`);

      // Initialize embedding service with config
      const embeddingConfig = {
        provider: EmbeddingProvider.LOCAL,
        model: 'all-MiniLM-L6-v2',
      };
      this.embeddingService = new EmbeddingService(embeddingConfig);

      // Initialize vector store
      this.vectorStore = new VectorStore(config.vectorStore || {}, 384, this.performanceMonitor);
      await this.vectorStore.initialize();

      // Initialize context generator
      this.contextGenerator = new ContextGenerator(this.vectorStore, this.embeddingService);

      // Initialize performance monitor
      this.performanceMonitor = new PerformanceMonitorService();

      // Setup event handlers
      this.setupEventHandlers();

      this.initialized = true;
      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // Setup periodic sync (simplified for now)
    setInterval(async () => {
      try {
        // Basic maintenance tasks
        if (this.embeddingService) {
          this.embeddingService.clearCache();
        }
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      } catch (error) {
        logger.error('Periodic maintenance failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // Daily
  }

  async shutdown(): Promise<void> {
    logger.info('Services shut down');
  }

  // Service getters
  getConfigLoader(): ConfigLoader {
    return this.configLoader;
  }

  getGitSync(): GitSyncService {
    return this.gitSync;
  }

  getDocumentProcessor(): DocumentProcessor {
    return this.documentProcessor;
  }

  getVectorStore(): VectorStore {
    if (!this.vectorStore) {
      throw new Error('VectorStore not initialized');
    }
    return this.vectorStore;
  }

  getEmbeddingService(): EmbeddingService {
    if (!this.embeddingService) {
      throw new Error('EmbeddingService not initialized');
    }
    return this.embeddingService;
  }

  getContextGenerator(): ContextGenerator {
    if (!this.contextGenerator) {
      throw new Error('ContextGenerator not initialized');
    }
    return this.contextGenerator;
  }

  getPerformanceMonitor(): PerformanceMonitorService {
    if (!this.performanceMonitor) {
      throw new Error('PerformanceMonitor not initialized');
    }
    return this.performanceMonitor;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
