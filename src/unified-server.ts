import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from 'express';
import * as http from 'http';

import { ConfigLoader } from './utils/config-loader';
import { GitSyncService } from './services/git-sync';
import { DocumentProcessor } from './services/document-processor';
import { VectorStore } from './services/vector-store';
import { EmbeddingService, EmbeddingProvider } from './services/embedding';
import { ContextGenerator } from './services/context-generator';
import { PerformanceMonitorService } from './services/performance-monitor';
import { gracefulShutdown, createShutdownTasks } from './utils/graceful-shutdown';
import { DocumentWebSocketServer } from './services/websocket-server';
import logger from './utils/logger';

// Import route handlers
import createContextRoutes from './routes/context';
import createRepoRoutes from './routes/repos';
import createSearchRoutes from './routes/search';
import createWebhookRoutes from './routes/webhooks';
import createOlympusRoutes from './routes/olympus';
import createMetricsRoutes from './routes/metrics';

// Import middleware
import { setupSecurity } from './middleware/security';
import { errorHandler as authErrorHandler } from './middleware/auth';
import { createRateLimiter } from './middleware/rate-limit';
import { apiProtection } from './middleware/api-protection';

// Import MCP tools and handlers
import { 
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

export type ServerMode = 'mcp' | 'api' | 'enhanced' | 'websocket';

export interface UnifiedServerConfig {
  mode: ServerMode;
  port?: number;
  enableWebSocket?: boolean;
  enableMetrics?: boolean;
  maxMemory?: number;
  debug?: boolean;
}

/**
 * Unified server that can operate in multiple modes:
 * - mcp: Standard MCP protocol server (stdio)
 * - api: REST API server with HTTP endpoints
 * - enhanced: Enhanced MCP server with additional features
 * - websocket: WebSocket server for real-time communication
 */
export class UnifiedServer {
  private readonly configLoader: ConfigLoader;
  private readonly gitSync: GitSyncService;
  private readonly documentProcessor: DocumentProcessor;
  private vectorStore!: VectorStore;
  private embeddingService!: EmbeddingService;
  private contextGenerator!: ContextGenerator;
  private performanceMonitor!: PerformanceMonitorService;

  // Server instances
  private mcpServer?: Server;
  private expressApp?: express.Application;
  private httpServer?: http.Server;
  private wsServer?: DocumentWebSocketServer;
  
  private initialized: boolean = false;
  private readonly serverConfig: UnifiedServerConfig;

  constructor(config: UnifiedServerConfig) {
    this.serverConfig = config;
    this.configLoader = new ConfigLoader();
    this.gitSync = new GitSyncService();
    this.documentProcessor = new DocumentProcessor();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const config = await this.configLoader.loadConfig();
      
      // Initialize performance monitoring
      this.performanceMonitor = new PerformanceMonitorService({
        memoryWarning: this.serverConfig.maxMemory ? this.serverConfig.maxMemory * 0.8 : 1024,
        memoryCritical: this.serverConfig.maxMemory ?? 2048,
        cpuWarning: 70,
        cpuCritical: 90
      }, 30000);

      this.performanceMonitor.start();

      // Initialize core services
      this.vectorStore = new VectorStore(config.vectorStore!, 384, this.performanceMonitor);
      await this.vectorStore.initialize();

      this.embeddingService = new EmbeddingService({
        provider: EmbeddingProvider.LOCAL,
        model: 'Xenova/all-MiniLM-L6-v2'
      });

      this.contextGenerator = new ContextGenerator(
        this.vectorStore,
        this.embeddingService,
        config.contextGeneration || {}
      );

      // Initialize server based on mode
      await this.initializeServerMode();

      this.initialized = true;
      logger.info(`Unified server initialized in ${this.serverConfig.mode} mode`);

    } catch (error) {
      logger.error('Failed to initialize unified server:', error);
      throw error;
    }
  }

  private async initializeServerMode(): Promise<void> {
    switch (this.serverConfig.mode) {
      case 'mcp':
        await this.initializeMCPServer();
        break;
      case 'api':
        await this.initializeAPIServer();
        break;
      case 'enhanced':
        await this.initializeEnhancedMCPServer();
        break;
      case 'websocket':
        await this.initializeWebSocketServer();
        break;
      default:
        throw new Error(`Unknown server mode: ${this.serverConfig.mode}`);
    }
  }

  private async initializeMCPServer(): Promise<void> {
    this.mcpServer = new Server({
      name: "olympus-docs-server",
      version: "1.1.2"
    }, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    });

    // Register MCP tools and handlers
    this.registerMCPHandlers();
    
    // Connect to stdio
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }

  private async initializeAPIServer(): Promise<void> {
    this.expressApp = express();
    
    // Setup middleware
    this.setupExpressMiddleware();
    
    // Setup routes
    this.setupExpressRoutes();

    // Start HTTP server
    const port = this.serverConfig.port ?? 3000;
    this.httpServer = this.expressApp.listen(port, () => {
      logger.info(`API Server running on port ${port}`);
    });
  }

  private async initializeEnhancedMCPServer(): Promise<void> {
    // Enhanced MCP server with additional capabilities
    await this.initializeMCPServer();
    
    // Add enhanced features like progress tracking, subscriptions, etc.
    this.addEnhancedMCPFeatures();
  }

  private async initializeWebSocketServer(): Promise<void> {
    // Create minimal Express app for WebSocket upgrade
    this.expressApp = express();
    const port = this.serverConfig.port ?? 3000;
    
    this.httpServer = this.expressApp.listen(port, () => {
      logger.info(`WebSocket Server running on port ${port}`);
    });

    this.wsServer = new DocumentWebSocketServer({ server: this.httpServer });
    await this.wsServer.start();
  }

  private setupExpressMiddleware(): void {
    if (!this.expressApp) return;

    // Security middleware
    setupSecurity(this.expressApp);
    
    // Rate limiting
    const rateLimiter = createRateLimiter();
    this.expressApp.use(rateLimiter);

    // API protection
    this.expressApp.use(apiProtection);

    // Authentication middleware (applied selectively)
    // this.expressApp.use(authenticate);

    // Error handling
    this.expressApp.use(authErrorHandler);
  }

  private setupExpressRoutes(): void {
    if (!this.expressApp) return;

    // Health check endpoint
    this.expressApp.get('/health', (_req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // API routes
    this.expressApp.use('/api/v1/context', createContextRoutes(this.contextGenerator));
    this.expressApp.use('/api/v1/repos', createRepoRoutes(this.configLoader, this.gitSync, this.vectorStore));
    this.expressApp.use('/api/v1/search', createSearchRoutes(this.vectorStore, this.embeddingService));
    this.expressApp.use('/api/v1/webhooks', createWebhookRoutes(this.configLoader, this.gitSync));
    this.expressApp.use('/api/v1/olympus', createOlympusRoutes(this.vectorStore, this.embeddingService, this.contextGenerator));
    
    if (this.serverConfig.enableMetrics) {
      this.expressApp.use('/metrics', createMetricsRoutes());
    }
  }

  private registerMCPHandlers(): void {
    if (!this.mcpServer) return;

    // Register tool handlers
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.handleToolCall(request);
    });

    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.listTools();
    });

    this.mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
      return this.listResources();
    });

    this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return this.readResource(request);
    });
  }

  private addEnhancedMCPFeatures(): void {
    if (!this.mcpServer) return;

    // Add enhanced features like prompts, subscriptions, etc.
    this.mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: [] };
    });

    this.mcpServer.setRequestHandler(GetPromptRequestSchema, async (_request) => {
      return { messages: [] };
    });
  }

  private async handleToolCall(request: any): Promise<any> {
    // Implement tool call handling logic
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'search_docs':
        return this.handleSearchDocs(args);
      case 'get_context':
        return this.handleGetContext(args);
      case 'sync_repositories':
        return this.handleSyncRepositories();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async handleSearchDocs(args: any): Promise<any> {
    // Implement search docs logic
    const results = await this.vectorStore.search(args.query, args.maxResults ?? 20);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  private async handleGetContext(args: any): Promise<any> {
    // Implement get context logic
    const context = await this.contextGenerator.generateContext({
      task: args.query,
      repositories: args.repositories,
      language: args.language,
      framework: args.framework
    });
    
    return {
      content: [{
        type: "text",
        text: context
      }]
    };
  }

  private async handleSyncRepositories(): Promise<any> {
    // Implement repository sync logic
    const config = this.configLoader.getConfig();
    await this.gitSync.syncAll(config.repositories);
    return {
      content: [{
        type: "text",
        text: "Repository sync completed"
      }]
    };
  }

  private async listTools(): Promise<any> {
    return {
      tools: [
        {
          name: "search_docs",
          description: "Search documentation across configured repositories",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              maxResults: { type: "number", description: "Maximum results", default: 20 }
            },
            required: ["query"]
          }
        },
        {
          name: "get_context",
          description: "Generate contextual documentation for a specific task",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Context query" },
              repositories: { type: "array", items: { type: "string" } },
              language: { type: "string" },
              framework: { type: "string" }
            },
            required: ["query"]
          }
        },
        {
          name: "sync_repositories",
          description: "Synchronize all configured repositories",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    };
  }

  private async listResources(): Promise<any> {
    return { resources: [] };
  }

  private async readResource(_request: any): Promise<any> {
    return {
      contents: [{
        type: "text",
        text: "Resource content"
      }]
    };
  }

  async start(): Promise<void> {
    await this.initialize();
    
    // Setup graceful shutdown
    gracefulShutdown.addTask(createShutdownTasks.cleanup(async () => this.performanceMonitor?.stop(), 'Performance Monitor'));
    gracefulShutdown.addTask(createShutdownTasks.server(this.httpServer, 'HTTP Server'));
    gracefulShutdown.addTask(createShutdownTasks.cleanup(async () => this.wsServer?.shutdown(), 'WebSocket Server'));

    process.on('SIGINT', () => gracefulShutdown.shutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown.shutdown('SIGTERM'));
  }

  async stop(): Promise<void> {
    logger.info('Stopping unified server...');
    
    this.performanceMonitor?.stop();
    
    if (this.httpServer) {
      this.httpServer.close();
    }
    
    if (this.wsServer) {
      await this.wsServer.shutdown();
    }
    
    logger.info('Unified server stopped');
  }
}

// CLI interface for the unified server
export async function startUnifiedServer(config: UnifiedServerConfig): Promise<void> {
  const server = new UnifiedServer(config);
  await server.start();
}
