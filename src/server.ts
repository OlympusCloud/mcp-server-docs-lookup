import * as readline from 'readline';
import { MCPRequest, MCPResponse, MCPTool, MCPCapabilities } from './types/mcp';
import { ConfigLoader } from './utils/config-loader';
import { GitSyncService } from './services/git-sync';
import { DocumentProcessor } from './services/document-processor';
import { VectorStore } from './services/vector-store';
import { EmbeddingService, EmbeddingProvider } from './services/embedding';
import { ContextGenerator, ContextQuery } from './services/context-generator';
import { PerformanceMonitorService } from './services/performance-monitor';
import logger from './utils/logger';
import { InputValidator, ValidationError } from './utils/validation';
import { gracefulShutdown, createShutdownTasks } from './utils/graceful-shutdown';
export class MCPServer {
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
    if (this.initialized) return;
    try {
      const config = await this.configLoader.loadConfig();
      // Initialize performance monitor first
      this.performanceMonitor = new PerformanceMonitorService({
        memoryWarning: 1024,
        memoryCritical: 2048,
        cpuWarning: 70,
        cpuCritical: 90
      }, 30000);

      this.performanceMonitor.start();
      
      this.vectorStore = new VectorStore(config.vectorStore!, 384, this.performanceMonitor);
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

      this.documentProcessor = new DocumentProcessor(undefined, this.performanceMonitor);

      this.setupGitSyncHandlers();
      
      // Don't sync on startup - let users trigger this manually
      // await this.gitSync.syncAll(config.repositories);
      
      config.repositories.forEach(repo => {
        if (repo.syncInterval && repo.syncInterval > 0) {
          this.gitSync.startScheduledSync(repo);
        }
      });

      // Setup periodic memory cleanup
      const memoryCleanupInterval = setInterval(() => {
        try {
          // Clear embedding cache
          if (this.embeddingService) {
            this.embeddingService.clearCache();
          }
          
          // Force garbage collection if available
          if (global.gc) {
            const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
            global.gc();
            const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
            
            // Only log if significant memory was freed or in debug mode
            if ((memBefore - memAfter) > 10 || process.env.MCP_DEBUG === 'true') {
              logger.debug('Manual garbage collection performed', {
                memoryBefore: `${memBefore.toFixed(2)}MB`,
                memoryAfter: `${memAfter.toFixed(2)}MB`,
                freed: `${(memBefore - memAfter).toFixed(2)}MB`
              });
            }
          }
          
          // Check memory usage and trigger aggressive cleanup if needed
          const memUsage = process.memoryUsage();
          const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
          
          if (heapPercentage > 80) {
            logger.warn('High heap usage detected, triggering aggressive cleanup', {
              heapPercentage: heapPercentage.toFixed(2),
              heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
              heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`
            });
            
            // Clear all caches
            if (this.embeddingService) {
              this.embeddingService.clearCache();
            }
            
            // Force immediate garbage collection
            if (global.gc) {
              global.gc();
              global.gc(); // Run twice for thorough cleanup
            }
          }
        } catch (error) {
          logger.error('Error during memory cleanup', { error });
        }
      }, 300000); // Every 5 minutes
      
      memoryCleanupInterval.unref(); // Don't keep process alive

      this.initialized = true;
      logger.info('MCP Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MCP Server', { error });
      throw error;
    }
  }

  private setupGitSyncHandlers(): void {
    this.gitSync.on('file:changed', async (repo, filepath) => {
      try {
        this.performanceMonitor.updateApplicationMetrics({ documentsIndexed: 1 });
        
        const content = await this.gitSync.getFileContent(repo, filepath);
        const result = await this.documentProcessor.processDocument(filepath, content, repo);
        
        if (result.chunks.length > 0) {
          this.performanceMonitor.updateApplicationMetrics({ chunksProcessed: result.chunks.length });
          
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

  getCapabilities(): MCPCapabilities {
    return {
      name: 'universal-doc-mcp',
      version: '1.0.0',
      description: 'Universal documentation MCP server for AI coding assistants',
      tools: this.getTools()
    };
  }

  private getTools(): MCPTool[] {
    return [
      {
        name: 'search_docs',
        description: 'Search documentation across all indexed repositories',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query or task description'
            },
            language: {
              type: 'string', 
              description: 'Programming language filter (optional)'
            },
            framework: {
              type: 'string',
              description: 'Framework filter (optional)'
            },
            repositories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by specific repositories (optional)'
            },
            maxResults: {
              type: 'integer',
              description: 'Maximum number of results (default: 20)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_context',
        description: 'Get relevant documentation context for a coding task',
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'The coding task or problem to solve'
            },
            language: {
              type: 'string',
              description: 'Programming language (optional)'
            },
            framework: {
              type: 'string',
              description: 'Framework being used (optional)'
            },
            maxResults: {
              type: 'integer',
              description: 'Maximum number of context chunks (default: 20)'
            }
          },
          required: ['task']
        }
      },
      {
        name: 'list_repos',
        description: 'List all indexed repositories and their status',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'sync_repository',
        description: 'Manually trigger a repository sync',
        inputSchema: {
          type: 'object',
          properties: {
            repository: {
              type: 'string',
              description: 'Repository name to sync'
            }
          },
          required: ['repository']
        }
      }
    ];
  }

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      switch (request.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {
                  listChanged: true
                },
                logging: {}
              },
              serverInfo: {
                name: 'olympus-docs-mcp',
                version: '1.0.4'
              }
            }
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: { tools: this.getTools() }
          };

        case 'tools/call':
        case 'tools/invoke':
          return await this.invokeTool(request);

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (error) {
      logger.error('Error handling MCP request', { method: request.method, error });
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private async invokeTool(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params ?? {};
    switch (name) {
      case 'search_docs':
        return await this.searchDocumentation(request.id, args);

      case 'get_context':
        return await this.getContext(request.id, args);

      case 'list_repos':
        return await this.listRepositories(request.id, args);

      case 'sync_repository':
        return await this.syncRepository(request.id, args);

      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: `Unknown tool: ${name}`
          }
        };
    }
  }

  private async searchDocumentation(id: any, args: any): Promise<MCPResponse> {
    try {
      this.performanceMonitor.updateApplicationMetrics({ searchRequests: 1 });
      
      // Validate input
      const validatedArgs = InputValidator.validateSearchDocs(args ?? {});
      
      const query: ContextQuery = {
        task: validatedArgs.query,
        language: validatedArgs.language,
        framework: validatedArgs.framework,
        repositories: validatedArgs.repositories,
        maxResults: validatedArgs.maxResults
      };

      const result = await this.contextGenerator.generateContext(query);
      
      // Format results as MCP-compliant content array
      const formattedResults = result.results.map(chunk => 
        `## ${chunk.repository}:${chunk.filepath}\n\n${chunk.content}\n\nScore: ${chunk.score}`
      ).join('\n\n---\n\n');
      
      return {
        id,
        result: {
          content: [
            {
              type: 'text',
              text: formattedResults || 'No results found for your query.'
            }
          ]
        }
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          id,
          error: {
            code: -32602,
            message: 'Invalid parameters',
            data: error.errors || error.message
          }
        };
      }
      return {
        id,
        error: {
          code: -32603,
          message: 'Search failed',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private async getContext(id: any, args: any): Promise<MCPResponse> {
    try {
      this.performanceMonitor.updateApplicationMetrics({ searchRequests: 1 });
      // Validate input
      const validatedArgs = InputValidator.validateGetContext(args ?? {});
      const query: ContextQuery = {
        task: validatedArgs.task,
        language: validatedArgs.language,
        framework: validatedArgs.framework,
        maxResults: validatedArgs.maxResults
      };
      const result = await this.contextGenerator.generateContext(query);
      // Format context as MCP-compliant content array
      const contextText = result.content ?? 'No context found for your task.';
      const metadata = `\n\n---\n\nTotal chunks: ${result.metadata.totalChunks}\nSources: ${(result.metadata.relevantRepositories ?? []).join(', ')}`;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: contextText + metadata
            }
          ]
        }
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: 'Invalid parameters',
            data: error.errors ?? error.message
          }
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Context generation failed',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private async listRepositories(id: any, args: any): Promise<MCPResponse> {
    try {
      const config = this.configLoader.getConfig();
      const stats = await this.vectorStore.getStats();

      if (args.repository) {
        const repo = config.repositories.find(r => r.name === args.repository);
        if (!repo) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `Repository not found: ${args.repository}`
            }
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `**Repository Details:**\n\n- Name: ${repo.name}\n- URL: ${repo.url}\n- Branch: ${repo.branch}\n- Last Sync: ${new Date().toISOString()}\n- Status: indexed`
              }
            ]
          }
        };
      }

      // Format repository list as MCP-compliant content
      const repoList = config.repositories.map(repo => 
        `- **${repo.name}** (${repo.url})\n  Branch: ${repo.branch}\n  Priority: ${repo.priority}\n  Sync Interval: ${repo.syncInterval ?? 'manual'}`
      ).join('\n');
      
      const statsText = `\n\n**Stats:**\n- Total documents: ${stats.totalDocuments ?? 0}\n- Total chunks: ${stats.totalChunks ?? 0}`;
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `**Indexed Repositories:**\n\n${repoList}${statsText}`
            }
          ]
        }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Failed to get repository status',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private async syncRepository(id: any, args: any): Promise<MCPResponse> {
    try {
      // Validate input
      const validatedArgs = InputValidator.validateSyncRepository(args ?? {});
      const config = this.configLoader.getConfig();
      const repo = config.repositories.find(r => r.name === validatedArgs.repository);
      if (!repo) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `Repository not found: ${args.repository}`
          }
        };
      }
      await this.gitSync.syncRepository(repo);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Repository ${args.repository} synced successfully`
            }
          ]
        }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Sync failed',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  async start(): Promise<void> {
    await this.initialize();
    // Ensure stdin is set to the right encoding
    process.stdin.setEncoding('utf8');
    
    // Ensure the process doesn't exit on EOF
    process.stdin.resume();
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    // Handle each line of input
    rl.on('line', async (line) => {
      if (!line.trim()) {
        console.log("DEBUG: Empty line received, ignoring");
        return;
      }
      
      try {
        const request = JSON.parse(line) as MCPRequest;
        
        // Add request ID if missing (for robustness with some clients)
        request.id ??= `auto-${Date.now()}`;
        
        const response = await this.handleRequest(request);
        const responseJson = JSON.stringify(response);
        console.log(responseJson);
      } catch (error) {
        logger.error('Error processing line', { error, line: line.substring(0, 100) });
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0', // Add jsonrpc version to error responses too
          id: null, // Use null for parse errors
          error: {
            code: -32700,
            message: 'Parse error',
            data: error instanceof Error ? error.message : 'Invalid JSON'
          }
        };
        console.log(JSON.stringify(errorResponse));
      }
    });
    
    // Handle errors on stdin
    process.stdin.on('error', (error) => {
      logger.error('Error on stdin', { error });
    });

    logger.info('MCP Server started and listening for requests');
  }

  async stop(): Promise<void> {
    this.gitSync.stopAllScheduledSyncs();
    if (this.performanceMonitor) {
      this.performanceMonitor.stop();
    }
    logger.info('MCP Server stopped');
  }
}

if (require.main === module) {
  const server = new MCPServer();
  
  // Setup graceful shutdown
  gracefulShutdown.addTask(createShutdownTasks.cleanup(
    async () => {
      await server.stop();
    },
    'MCP Server'
  ));

  gracefulShutdown.setupSignalHandlers();
  server.start().catch(error => {
    logger.error('Failed to start MCP Server', { error });
    process.exit(1);
  });
}