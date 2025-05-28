import express from 'express';
import * as http from 'http';
import { ConfigLoader } from './utils/config-loader';
import { GitSyncService } from './services/git-sync';
import { DocumentProcessor } from './services/document-processor';
import { VectorStore } from './services/vector-store';
import { EmbeddingService, EmbeddingProvider } from './services/embedding';
import { ContextGenerator } from './services/context-generator';
import { DocumentWebSocketServer } from './websocket-server';
import { metrics } from './services/metrics';
import { setupSecurity } from './middleware/security';
import { authenticate, authorize, errorHandler as authErrorHandler } from './middleware/auth';
import { createRateLimiter } from './middleware/rate-limit';
import { apiProtection } from './middleware/api-protection';
import createContextRoutes from './routes/context';
import createRepoRoutes from './routes/repos';
import createSearchRoutes from './routes/search';
import createWebhookRoutes from './routes/webhooks';
import createOlympusRoutes from './routes/olympus';
import createMetricsRoutes from './routes/metrics';
import { HealthCheckService } from './services/health-check';
import { gracefulShutdown, createShutdownTasks } from './utils/graceful-shutdown';
import logger from './utils/logger';

export class APIServer {
  private app: express.Application;
  private configLoader: ConfigLoader;
  private gitSync: GitSyncService;
  private documentProcessor: DocumentProcessor;
  private vectorStore!: VectorStore;
  private embeddingService!: EmbeddingService;
  private contextGenerator!: ContextGenerator;
  private healthCheck!: HealthCheckService;
  public server: http.Server | null = null;
  private wsServer: DocumentWebSocketServer | null = null;

  constructor() {
    this.app = express();
    this.configLoader = new ConfigLoader();
    this.gitSync = new GitSyncService();
    this.documentProcessor = new DocumentProcessor();
  }

  async initialize(): Promise<void> {
    const config = await this.configLoader.loadConfig();
    
    this.vectorStore = new VectorStore(config.vectorStore!);
    await this.vectorStore.initialize();

    this.embeddingService = new EmbeddingService({
      provider: EmbeddingProvider.LOCAL,
      model: 'Xenova/all-MiniLM-L6-v2'
    });

    this.contextGenerator = new ContextGenerator(
      this.vectorStore,
      this.embeddingService,
      config.contextGeneration
    );

    this.healthCheck = new HealthCheckService(this.vectorStore, this.configLoader);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupGitSyncHandlers();
    
    await this.gitSync.syncAll(config.repositories);
    
    config.repositories.forEach(repo => {
      if (repo.syncInterval && repo.syncInterval > 0) {
        this.gitSync.startScheduledSync(repo);
      }
    });

    // Start periodic health checks
    this.healthCheck.startPeriodicChecks(60000); // Every minute
  }

  private setupMiddleware(): void {
    // const config = this.configLoader.getConfig();
    
    // Security middleware
    setupSecurity(this.app);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging and metrics
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        metrics.histogram('http.request.duration', duration, {
          method: req.method,
          path: req.path,
          status: res.statusCode.toString()
        });
        metrics.increment('http.requests.total', {
          method: req.method,
          path: req.path,
          status: res.statusCode.toString()
        });
      });
      
      logger.info('API Request', {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip
      });
      next();
    });
    
    // Rate limiting
    this.app.use(createRateLimiter());
    
    // API protection for sensitive endpoints
    this.app.use('/api/repos', apiProtection());
    this.app.use('/api/webhooks', apiProtection());
    this.app.use('/api/presets/:name/apply', apiProtection());
  }

  private setupRoutes(): void {
    // Health check endpoints (no auth required)
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.healthCheck.getHealthStatus();
        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'degraded' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          message: 'Health check failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Kubernetes-style health endpoints
    this.app.get('/health/ready', async (req, res) => {
      try {
        const readiness = this.healthCheck.getReadinessStatus();
        res.status(readiness.ready ? 200 : 503).json(readiness);
      } catch (error) {
        res.status(503).json({
          ready: false,
          message: 'Readiness check failed'
        });
      }
    });

    this.app.get('/health/live', async (req, res) => {
      try {
        const liveness = this.healthCheck.getLivenessStatus();
        res.status(liveness.alive ? 200 : 503).json(liveness);
      } catch (error) {
        res.status(503).json({
          alive: false,
          message: 'Liveness check failed'
        });
      }
    });
    
    // Metrics endpoint (requires admin auth)
    this.app.use('/metrics', authenticate(), authorize(['metrics:read']), createMetricsRoutes());

    // API routes with authentication
    this.app.use('/api/context', authenticate(), createContextRoutes(this.contextGenerator));
    this.app.use('/api/repos', authenticate(), authorize(['repos:read']), createRepoRoutes(
      this.configLoader,
      this.gitSync,
      this.vectorStore
    ));
    this.app.use('/api/search', authenticate(), createSearchRoutes(
      this.vectorStore,
      this.embeddingService
    ));
    this.app.use('/api/webhooks', authenticate(), authorize(['webhooks:write']), createWebhookRoutes(
      this.configLoader,
      this.gitSync
    ));
    this.app.use('/api/olympus', authenticate(), createOlympusRoutes(
      this.vectorStore,
      this.embeddingService,
      this.contextGenerator
    ));

    this.app.get('/api/config', authenticate(), (req, res) => {
      const config = this.configLoader.getConfig();
      res.json({
        project: config.project,
        repositories: config.repositories.map(repo => ({
          name: repo.name,
          url: repo.url,
          branch: repo.branch,
          category: repo.category,
          priority: repo.priority
        })),
        contextGeneration: config.contextGeneration
      });
    });

    this.app.get('/api/presets', authenticate(), async (req, res) => {
      try {
        const presets = await this.configLoader.listPresets();
        res.json({ presets });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to list presets',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.app.post('/api/presets/:name/apply', authenticate(), authorize(['config:write']), async (req, res) => {
      try {
        const { name } = req.params;
        await this.configLoader.applyPreset(name);
        await this.configLoader.saveConfig();
        
        res.json({
          message: `Preset ${name} applied successfully`
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to apply preset',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Authentication error handler
    this.app.use(authErrorHandler);
    
    // 404 handler
    this.app.use((req, res) => {
      metrics.increment('http.errors.404');
      res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });

    // General error handler
    this.app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error', { error: err });
      metrics.increment('http.errors.500');
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
      });
    });
  }

  private setupGitSyncHandlers(): void {
    this.gitSync.on('file:changed', async (repo, filepath) => {
      try {
        const content = await this.gitSync.getFileContent(repo, filepath);
        const result = await this.documentProcessor.processDocument(filepath, content, repo);
        
        if (result.chunks.length > 0) {
          const chunksWithEmbeddings = await this.embeddingService.generateChunkEmbeddings(result.chunks);
          await this.vectorStore.upsertChunks(chunksWithEmbeddings);
        }
      } catch (error) {
        logger.error('Failed to process file change', { 
          repository: repo.name,
          filepath,
          error 
        });
      }
    });
  }

  async start(): Promise<void> {
    await this.initialize();
    
    const config = this.configLoader.getConfig();
    const port = config.server?.port || 3000;
    const host = config.server?.host || 'localhost';

    this.server = http.createServer(this.app);
    
    // Initialize WebSocket server
    this.wsServer = new DocumentWebSocketServer(this.server, this.gitSync);
    
    this.server.listen(port, host, () => {
      logger.info(`API Server listening on http://${host}:${port}`);
      logger.info(`WebSocket server available at ws://${host}:${port}/ws`);
    });
  }

  async stop(): Promise<void> {
    this.gitSync.stopAllScheduledSyncs();
    this.healthCheck.stopPeriodicChecks();
    
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
    }
    
    logger.info('API Server stopped');
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
if (require.main === module) {
  const server = new APIServer();
  
  // Setup graceful shutdown tasks
  gracefulShutdown.addTask(createShutdownTasks.server(
    server.server,
    'HTTP Server'
  ));

  gracefulShutdown.addTask(createShutdownTasks.cleanup(
    async () => {
      await server.stop();
    },
    'API Server Cleanup'
  ));

  gracefulShutdown.setupSignalHandlers();

  server.start().catch(error => {
    logger.error('Failed to start API Server', { error });
    process.exit(1);
  });
}