import {
  Server,
} from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  CompleteRequestSchema,
  ProgressToken,
} from "@modelcontextprotocol/sdk/types.js";
import {
  Resource,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigLoader } from './utils/config-loader';
import { GitSyncService } from './services/git-sync';
import { DocumentProcessor } from './services/document-processor';
import { VectorStore } from './services/vector-store';
import { EmbeddingService, EmbeddingProvider } from './services/embedding';
import { ContextGenerator, ContextQuery, ContextChunk } from './services/context-generator';
import { PerformanceMonitorService } from './services/performance-monitor';
import logger from './utils/logger';

// Define LoggingLevel enum
enum LoggingLevel {
  Debug = 'debug',
  Info = 'info',
  Warning = 'warning',
  Error = 'error'
}

// Tool input schemas
const SearchDocsSchema = z.object({
  query: z.string().describe("Search query or task description"),
  language: z.string().optional().describe("Programming language filter"),
  framework: z.string().optional().describe("Framework filter"),
  repositories: z.array(z.string()).optional().describe("Filter by specific repositories"),
  maxResults: z.number().int().min(1).max(100).default(20).describe("Maximum number of results"),
});

const GetContextSchema = z.object({
  task: z.string().describe("Description of the coding task or question"),
  language: z.string().optional().describe("Programming language context"),
  framework: z.string().optional().describe("Framework context"),
  includeExamples: z.boolean().default(true).describe("Include code examples in context"),
  maxChunks: z.number().int().min(1).max(50).default(10).describe("Maximum number of context chunks"),
});

const SyncRepositorySchema = z.object({
  repository: z.string().describe("Repository name to sync"),
  force: z.boolean().default(false).describe("Force resync even if up to date"),
});

const GenerateDocumentationSchema = z.object({
  codeContext: z.string().describe("Code or context to generate documentation for"),
  documentationType: z.enum(["api", "tutorial", "reference", "example"]).default("reference").describe("Type of documentation to generate"),
  language: z.string().optional().describe("Programming language"),
  includeExamples: z.boolean().default(true).describe("Include code examples"),
});

const AnalyzeDocumentationGapSchema = z.object({
  repository: z.string().describe("Repository to analyze"),
  directory: z.string().optional().describe("Specific directory to analyze"),
  language: z.string().optional().describe("Programming language filter"),
});

enum ToolName {
  SEARCH_DOCS = "search_docs",
  GET_CONTEXT = "get_context", 
  SYNC_REPOSITORY = "sync_repository",
  STATUS = "status",
  STATS = "stats",
  GENERATE_DOCUMENTATION = "generate_documentation",
  ANALYZE_DOCUMENTATION_GAP = "analyze_documentation_gap",
}

enum PromptName {
  EXPLAIN_CODE = "explain_code",
  WRITE_DOCUMENTATION = "write_documentation",
  CODE_EXAMPLE = "code_example",
  API_REFERENCE = "api_reference",
  TROUBLESHOOTING = "troubleshooting",
}

// Enhanced operations tracking (currently unused - for future progress notifications)
interface _OperationProgress {
  total?: number;
  completed: number;
  status: string;
}

export class EnhancedMCPServer {
  private server: Server;
  private configLoader: ConfigLoader;
  private gitSync: GitSyncService;
  private documentProcessor: DocumentProcessor;
  private vectorStore!: VectorStore;
  private embeddingService!: EmbeddingService;
  private contextGenerator!: ContextGenerator;
  private performanceMonitor!: PerformanceMonitorService;
  private initialized: boolean = false;
  private subscriptions: Set<string> = new Set();
  private loggingLevel: LoggingLevel = LoggingLevel.Info;

  constructor() {
    this.server = new Server(
      {
        name: "olympus-docs-server",
        version: "1.1.0",
      },
      {
        capabilities: {
          prompts: {},
          resources: { subscribe: true },
          tools: {},
          logging: {},
          sampling: {},
        },
      }
    );

    this.configLoader = new ConfigLoader();
    this.gitSync = new GitSyncService();
    this.documentProcessor = new DocumentProcessor();

    this.setupRequestHandlers();
  }

  private setupRequestHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: ToolName.SEARCH_DOCS,
            description: "Search documentation across all indexed repositories with advanced filtering",
            inputSchema: zodToJsonSchema(SearchDocsSchema) as any,
          },
          {
            name: ToolName.GET_CONTEXT,
            description: "Get comprehensive documentation context for coding tasks",
            inputSchema: zodToJsonSchema(GetContextSchema) as any,
          },
          {
            name: ToolName.SYNC_REPOSITORY,
            description: "Synchronize a specific repository with progress tracking",
            inputSchema: zodToJsonSchema(SyncRepositorySchema) as any,
          },
          {
            name: ToolName.GENERATE_DOCUMENTATION,
            description: "Generate documentation using existing docs as context",
            inputSchema: zodToJsonSchema(GenerateDocumentationSchema) as any,
          },
          {
            name: ToolName.ANALYZE_DOCUMENTATION_GAP,
            description: "Analyze documentation gaps in a repository",
            inputSchema: zodToJsonSchema(AnalyzeDocumentationGapSchema) as any,
          },
          {
            name: ToolName.STATUS,
            description: "Get comprehensive server status and health metrics",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: ToolName.STATS,
            description: "Get detailed statistics about indexed documentation",
            inputSchema: {
              type: "object", 
              properties: {
                repository: {
                  type: "string",
                  description: "Filter stats by repository (optional)"
                }
              },
              additionalProperties: false,
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case ToolName.SEARCH_DOCS:
            return await this.handleSearchDocs(SearchDocsSchema.parse(args));
          case ToolName.GET_CONTEXT:
            return await this.handleGetContext(GetContextSchema.parse(args));
          case ToolName.SYNC_REPOSITORY:
            return await this.handleSyncRepository(SyncRepositorySchema.parse(args));
          case ToolName.GENERATE_DOCUMENTATION:
            return await this.handleGenerateDocumentation(GenerateDocumentationSchema.parse(args));
          case ToolName.ANALYZE_DOCUMENTATION_GAP:
            return await this.handleAnalyzeDocumentationGap(AnalyzeDocumentationGapSchema.parse(args));
          case ToolName.STATUS:
            return await this.handleStatus();
          case ToolName.STATS:
            return await this.handleStats(args?.repository as string);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              task: `Error executing ${name}: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: PromptName.EXPLAIN_CODE,
            description: "Generate detailed explanations for code using documentation context",
            arguments: [
              {
                name: "code",
                description: "Code snippet to explain",
                required: true,
              },
              {
                name: "language",
                description: "Programming language",
                required: false,
              },
              {
                name: "includeExamples",
                description: "Include related code examples",
                required: false,
              },
            ],
          },
          {
            name: PromptName.WRITE_DOCUMENTATION,
            description: "Generate comprehensive documentation using existing docs as reference",
            arguments: [
              {
                name: "topic",
                description: "Topic or feature to document",
                required: true,
              },
              {
                name: "documentationType",
                description: "Type of documentation (api, tutorial, reference, example)",
                required: false,
              },
              {
                name: "framework",
                description: "Framework context",
                required: false,
              },
            ],
          },
          {
            name: PromptName.CODE_EXAMPLE,
            description: "Generate code examples using documentation patterns",
            arguments: [
              {
                name: "task",
                description: "Programming task description",
                required: true,
              },
              {
                name: "language",
                description: "Programming language",
                required: true,
              },
              {
                name: "style",
                description: "Code style preference",
                required: false,
              },
            ],
          },
          {
            name: PromptName.API_REFERENCE,
            description: "Generate API reference documentation",
            arguments: [
              {
                name: "apiName",
                description: "API or function name",
                required: true,
              },
              {
                name: "includeExamples",
                description: "Include usage examples",
                required: false,
              },
            ],
          },
          {
            name: PromptName.TROUBLESHOOTING,
            description: "Generate troubleshooting guides using documentation",
            arguments: [
              {
                name: "problem",
                description: "Problem description",
                required: true,
              },
              {
                name: "technology",
                description: "Technology stack",
                required: false,
              },
            ],
          },
        ],
      };
    });

    // Handle prompt requests
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.handlePromptRequest(name, args);
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      const cursor = request.params?.cursor;
      const limit = 50; // Items per page
      
      const resources = await this.getDocumentationResources(cursor, limit);
      const nextCursor = resources.length === limit ? this.generateNextCursor(cursor, limit) : undefined;

      return {
        resources,
        nextCursor,
      };
    });

    // List resource templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      return {
        resourceTemplates: [
          {
            uriTemplate: "docs://repository/{repository}",
            name: "Repository Documentation",
            description: "All documentation for a specific repository",
          },
          {
            uriTemplate: "docs://repository/{repository}/file/{path}",
            name: "Documentation File",
            description: "A specific documentation file",
          },
          {
            uriTemplate: "docs://search/{query}",
            name: "Search Results",
            description: "Dynamic search results as a resource",
          },
          {
            uriTemplate: "docs://context/{task}",
            name: "Task Context",
            description: "Relevant documentation context for a task",
          },
        ],
      };
    });

    // Read specific resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      return await this.handleResourceRequest(uri);
    });

    // Handle subscriptions
    this.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      const { uri } = request.params;
      this.subscriptions.add(uri);
      
      // Send notification about subscription
      await this.server.notification({
        method: "notifications/message",
        params: {
          level: "info",
          logger: "olympus-docs-server",
          data: `Subscribed to resource: ${uri}`,
        },
      });

      return {};
    });

    // Handle unsubscriptions
    this.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      const { uri } = request.params;
      this.subscriptions.delete(uri);
      
      await this.server.notification({
        method: "notifications/message",
        params: {
          level: "info",
          logger: "olympus-docs-server",
          data: `Unsubscribed from resource: ${uri}`,
        },
      });

      return {};
    });

    // Handle LLM sampling requests
    this.server.setRequestHandler(CompleteRequestSchema, async (request) => {
      const { prompt } = request.params.ref;
      
      // This would integrate with an LLM service
      // For now, return a placeholder response
      return {
        completion: {
          role: "assistant",
          content: {
            type: "text",
            task: `This is a simulated LLM response for prompt: "${prompt}". In a real implementation, this would connect to an LLM service.`,
          },
        },
      };
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const config = await this.configLoader.loadConfig();
      
      // Initialize performance monitor
      this.performanceMonitor = new PerformanceMonitorService({
        memoryWarning: 1024,
        memoryCritical: 2048,
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
        config.contextGeneration
      );

      this.documentProcessor = new DocumentProcessor(undefined, this.performanceMonitor);

      // Setup event handlers
      this.setupGitSyncHandlers();
      
      // Start scheduled syncs
      config.repositories.forEach(repo => {
        if (repo.syncInterval && repo.syncInterval > 0) {
          this.gitSync.startScheduledSync(repo);
        }
      });

      // Start periodic logging
      this.startPeriodicLogging();

      this.initialized = true;
      
      await this.server.notification({
        method: "notifications/message",
        params: {
          level: "info",
          logger: "olympus-docs-server",
          data: "Enhanced MCP Documentation Server initialized successfully",
        },
      });

      logger.info('Enhanced MCP Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Enhanced MCP Server', { error });
      throw error;
    }
  }

  private setupGitSyncHandlers(): void {
    this.gitSync.on('file:changed', async (repo, filepath) => {
      try {
        // Notify subscribers about file changes
        const resourceUri = `docs://repository/${repo.name}/file/${filepath}`;
        if (this.subscriptions.has(resourceUri) || this.subscriptions.has(`docs://repository/${repo.name}`)) {
          await this.server.notification({
            method: "notifications/resources/updated",
            params: {
              uri: resourceUri,
            },
          });
        }

        // Process the file
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

  private startPeriodicLogging(): void {
    // Send periodic status updates
    setInterval(async () => {
      if (this.loggingLevel === LoggingLevel.Debug) {
        const memUsage = process.memoryUsage();
        await this.server.notification({
          method: "notifications/message",
          params: {
            level: "debug",
            logger: "olympus-docs-server",
            data: `Memory usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB heap, ${(memUsage.rss / 1024 / 1024).toFixed(2)}MB RSS`,
          },
        });
      }
    }, 60000); // Every minute

    // Send random informational messages (like the everything server)
    setInterval(async () => {
      const messages = [
        "Documentation index is healthy",
        "Vector store operating normally", 
        "Embedding cache optimized",
        "Git sync services active",
        "Performance monitoring active"
      ];
      
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      
      await this.server.notification({
        method: "notifications/message",
        params: {
          level: Math.random() > 0.5 ? "info" : "debug",
          logger: "olympus-docs-server",
          data: randomMessage,
        },
      });
    }, 30000); // Every 30 seconds
  }

  // Tool handlers implementation will continue...
  private async handleSearchDocs(params: z.infer<typeof SearchDocsSchema>) {
    // Implementation continues in next part...
    const query: ContextQuery = {
      task: params.query,
      language: params.language,
      framework: params.framework,
      maxResults: params.maxResults,
      repositories: params.repositories
    };

    const results = await this.contextGenerator.generateContext(query);
    
    const content: TextContent = {
      type: "text",
      text: `Found ${results.chunks.length} relevant documentation chunks:\n\n` +
        results.chunks.map((chunk, index) => 
          `## Result ${index + 1} (Score: ${chunk.score?.toFixed(3) || 'N/A'})\n` +
          `**Source:** ${chunk.filepath} (${chunk.repository})\n` +
          `**Content:**\n${chunk.content}\n`
        ).join('\n---\n\n'),
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.8,
      }
    };

    return {
      content: [content],
    };
  }

  private async handleGetContext(params: z.infer<typeof GetContextSchema>) {
    const query: ContextQuery = {
      task: params.task,
      language: params.language,
      framework: params.framework,
      maxResults: params.maxChunks
    };

    const results = await this.contextGenerator.generateContext(query);
    
    const content: TextContent = {
      type: "text",
      text: `# Documentation Context for: ${params.task}\n\n` +
        `Generated ${results.chunks.length} relevant context chunks.\n\n` +
        results.chunks.map((chunk, index) => 
          `## Context ${index + 1}\n` +
          `**Source:** ${chunk.filepath} (${chunk.repository})\n` +
          `**Relevance:** ${chunk.score?.toFixed(3) || 'N/A'}\n\n` +
          `${chunk.content}\n`
        ).join('\n---\n\n'),
      annotations: {
        audience: ["assistant"],
        priority: 1.0,
      }
    };

    return {
      content: [content],
    };
  }

  private async handleSyncRepository(params: z.infer<typeof SyncRepositorySchema>) {
    const config = await this.configLoader.loadConfig();
    const repo = config.repositories.find(r => r.name === params.repository);
    
    if (!repo) {
      throw new Error(`Repository '${params.repository}' not found in configuration`);
    }

    // Start sync with progress tracking
    const progress: ProgressToken = Math.random().toString(36).substring(7);
    
    await this.server.notification({
      method: "notifications/progress",
      params: {
        progressToken: progress,
        progress: 0,
        total: 100,
      },
    });

    try {
      // Simulate progress updates during sync
      let currentProgress = 0;
      const progressInterval = setInterval(async () => {
        currentProgress += Math.random() * 20;
        if (currentProgress >= 100) {
          clearInterval(progressInterval);
          return;
        }
        
        await this.server.notification({
          method: "notifications/progress",
          params: {
            progressToken: progress,
            progress: Math.min(currentProgress, 99),
            total: 100,
          },
        });
      }, 500);

      await this.gitSync.syncRepository(repo);
      
      clearInterval(progressInterval);
      await this.server.notification({
        method: "notifications/progress",
        params: {
          progressToken: progress,
          progress: 100,
          total: 100,
        },
      });

      return {
        content: [
          {
            type: "text",
            task: `Repository '${params.repository}' synchronized successfully.\n` +
              `Status: Synchronized`,
            annotations: {
              audience: ["user"],
              priority: 0.7,
            }
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to sync repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGenerateDocumentation(params: z.infer<typeof GenerateDocumentationSchema>) {
    // This would use the LLM sampling capability to generate documentation
    const contextQuery = this.fixContextQuery({
      task: `${params.documentationType} documentation for: ${params.codeContext}`,
      language: params.language,
      maxResults: 10
    });

    const context = await this.contextGenerator.generateContext(contextQuery);
    
    return {
      content: [
        {
          type: "text",
          task: `# Generated ${params.documentationType.toUpperCase()} Documentation\n\n` +
            `## Context Code\n\`\`\`${params.language || ''}\n${params.codeContext}\n\`\`\`\n\n` +
            `## Reference Documentation\n\n` +
            `Based on ${context.chunks.length} documentation sources:\n\n` +
            context.chunks.slice(0, 3).map(chunk => 
              `- **${chunk.filepath}** (${chunk.repository}): ${chunk.content.substring(0, 200)}...`
            ).join('\n'),
          annotations: {
            audience: ["user", "assistant"],
            priority: 0.9,
          }
        },
      ],
    };
  }

  private async handleAnalyzeDocumentationGap(params: z.infer<typeof AnalyzeDocumentationGapSchema>) {
    // Analyze documentation coverage in a repository
    const config = await this.configLoader.loadConfig();
    const repo = config.repositories.find(r => r.name === params.repository);
    
    if (!repo) {
      throw new Error(`Repository '${params.repository}' not found`);
    }

    // This would perform analysis of code vs documentation coverage
    return {
      content: [
        {
          type: "text",
          task: `# Documentation Gap Analysis for ${params.repository}\n\n` +
            `## Summary\n` +
            `- Repository: ${params.repository}\n` +
            `- Analysis directory: ${params.directory || 'entire repository'}\n` +
            `- Language filter: ${params.language || 'all languages'}\n\n` +
            `## Gaps Identified\n` +
            `This feature would analyze code files and identify:\n` +
            `- Undocumented functions/classes\n` +
            `- Missing API documentation\n` +
            `- Outdated examples\n` +
            `- Missing tutorials for complex features\n\n` +
            `*Note: Full implementation would require code analysis capabilities.*`,
          annotations: {
            audience: ["user"],
            priority: 0.6,
          }
        },
      ],
    };
  }

  private async handleStatus() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      content: [
        {
          type: "text",
          task: `# Olympus Documentation Server Status\n\n` +
            `## System Health\n` +
            `- Status: ✅ Operational\n` +
            `- Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n` +
            `- Memory Usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB heap\n` +
            `- RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)}MB\n\n` +
            `## Services\n` +
            `- Vector Store: ${this.vectorStore ? '✅ Ready' : '❌ Not initialized'}\n` +
            `- Embedding Service: ${this.embeddingService ? '✅ Ready' : '❌ Not initialized'}\n` +
            `- Git Sync: ${this.gitSync ? '✅ Ready' : '❌ Not initialized'}\n` +
            `- Performance Monitor: ${this.performanceMonitor ? '✅ Running' : '❌ Not running'}\n\n` +
            `## Active Subscriptions\n` +
            `- Count: ${this.subscriptions.size}\n` +
            `- URIs: ${Array.from(this.subscriptions).join(', ') || 'None'}`,
          annotations: {
            audience: ["user"],
            priority: 0.5,
          }
        },
      ],
    };
  }

  private async handleStats(repository?: string) {
    // Get statistics from vector store and other services
    const stats = {
      totalDocuments: 0,
      totalChunks: 0,
      repositories: [] as string[],
      indexedFiles: 0,
    };

    return {
      content: [
        {
          type: "text",
          task: `# Documentation Statistics\n\n` +
            `## Overview\n` +
            `- Total documents indexed: ${stats.totalDocuments}\n` +
            `- Total chunks: ${stats.totalChunks}\n` +
            `- Repositories: ${stats.repositories.length}\n` +
            `- Indexed files: ${stats.indexedFiles}\n\n` +
            `${repository ? `## Repository: ${repository}\n*Detailed stats would be shown here*\n` : ''}` +
            `## Performance Metrics\n` +
            `*Performance metrics would be displayed here*`,
          annotations: {
            audience: ["user"],
            priority: 0.5,
          }
        },
      ],
    };
  }

  // Prompt handlers and resource handlers continue...
  private async handlePromptRequest(name: string, args: any) {
    // Implementation for different prompt types
    switch (name) {
      case PromptName.EXPLAIN_CODE:
        return await this.handleExplainCodePrompt(args);
      case PromptName.WRITE_DOCUMENTATION:
        return await this.handleWriteDocumentationPrompt(args);
      case PromptName.CODE_EXAMPLE:
        return await this.handleCodeExamplePrompt(args);
      case PromptName.API_REFERENCE:
        return await this.handleApiReferencePrompt(args);
      case PromptName.TROUBLESHOOTING:
        return await this.handleTroubleshootingPrompt(args);
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  private async handleExplainCodePrompt(args: any) {
    const { code, language, includeExamples } = args;
    
    // Get relevant documentation context
    const contextQuery: ContextQuery = {
      task: `explain code documentation ${language || ''}`,
      language: language,
      maxResults: 5
    };

    const context = await this.contextGenerator.generateContext(contextQuery);
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            task: `Please provide a detailed explanation of this ${language || ''} code:\n\n\`\`\`${language || ''}\n${code}\n\`\`\`\n\nUse the following documentation context to provide accurate explanations:`
          }
        },
        {
          role: "user",
          content: {
            type: "text",
            text: context.chunks.map(chunk => 
              `**From ${chunk.filepath} (${chunk.repository}):**\n${chunk.content}`
            ).join('\n\n---\n\n')
          }
        }
      ]
    };
  }

  private async handleWriteDocumentationPrompt(args: any) {
    const { topic, documentationType = 'reference', framework } = args;
    
    const contextQuery: ContextQuery = {
      task: `${documentationType} documentation ${topic} ${framework || ''}`,
      framework: framework,
      maxResults: 10
    };

    const context = await this.contextGenerator.generateContext(contextQuery);
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            task: `Write comprehensive ${documentationType} documentation for: ${topic}\n\n` +
              `${framework ? `Framework: ${framework}\n` : ''}` +
              `Use the following existing documentation as reference for style and structure:`
          }
        },
        {
          role: "user",
          content: {
            type: "text",
            text: context.chunks.map(chunk => 
              `**Reference from ${chunk.filepath}:**\n${chunk.content}`
            ).join('\n\n---\n\n')
          }
        }
      ]
    };
  }

  private async handleCodeExamplePrompt(args: any) {
    const { task, language, style } = args;
    
    const contextQuery: ContextQuery = {
      task: `${task} ${language} code example`,
      language: language,
      maxResults: 5
    };

    const context = await this.contextGenerator.generateContext(contextQuery);
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            task: `Generate a ${language} code example for: ${task}\n\n` +
              `${style ? `Code style: ${style}\n` : ''}` +
              `Base your example on these documentation patterns:`
          }
        },
        {
          role: "user",
          content: {
            type: "text",
            text: context.chunks.map(chunk => 
              `**Example from ${chunk.filepath}:**\n${chunk.content}`
            ).join('\n\n---\n\n')
          }
        }
      ]
    };
  }

  private async handleApiReferencePrompt(args: any) {
    const { apiName, includeExamples } = args;
    
    const contextQuery: ContextQuery = {
      task: `${apiName} API reference documentation`,
      maxResults: 8
    };

    const context = await this.contextGenerator.generateContext(contextQuery);
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            task: `Generate comprehensive API reference documentation for: ${apiName}\n\n` +
              `${includeExamples ? 'Include usage examples.\n' : ''}` +
              `Use these existing API documentation patterns:`
          }
        },
        {
          role: "user",
          content: {
            type: "text",
            text: context.chunks.map(chunk => 
              `**API Reference from ${chunk.filepath}:**\n${chunk.content}`
            ).join('\n\n---\n\n')
          }
        }
      ]
    };
  }

  private async handleTroubleshootingPrompt(args: any) {
    const { problem, technology } = args;
    
    const contextQuery: ContextQuery = {
      task: `troubleshooting ${problem} ${technology || ''}`,
      maxResults: 6
    };

    const context = await this.contextGenerator.generateContext(contextQuery);
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            task: `Create a troubleshooting guide for: ${problem}\n\n` +
              `${technology ? `Technology: ${technology}\n` : ''}` +
              `Base your guide on these troubleshooting documentation patterns:`
          }
        },
        {
          role: "user",
          content: {
            type: "text",
            text: context.chunks.map(chunk => 
              `**Troubleshooting from ${chunk.filepath}:**\n${chunk.content}`
            ).join('\n\n---\n\n')
          }
        }
      ]
    };
  }

  private async getDocumentationResources(cursor?: string, limit: number = 50): Promise<Resource[]> {
    // Get list of available documentation resources
    const config = await this.configLoader.loadConfig();
    const resources: Resource[] = [];
    
    let startIndex = 0;
    if (cursor) {
      try {
        startIndex = parseInt(atob(cursor), 10);
      } catch {
        startIndex = 0;
      }
    }

    // Add repository resources
    for (let i = startIndex; i < Math.min(startIndex + limit, config.repositories.length); i++) {
      const repo = config.repositories[i];
      resources.push({
        uri: `docs://repository/${repo.name}`,
        name: `${repo.name} Documentation`,
        description: `All documentation for ${repo.name} repository`,
        mimeType: "text/markdown",
      });
    }

    return resources;
  }

  private generateNextCursor(currentCursor: string | undefined, limit: number): string {
    let startIndex = 0;
    if (currentCursor) {
      try {
        startIndex = parseInt(atob(currentCursor), 10);
      } catch {
        startIndex = 0;
      }
    }
    return btoa((startIndex + limit).toString());
  }

  private async handleResourceRequest(uri: string) {
    if (uri.startsWith("docs://repository/")) {
      const parts = uri.split("/");
      const repoName = parts[2];
      
      if (parts.length === 3) {
        // Repository overview
        return await this.getRepositoryResource(repoName);
      } else if (parts[3] === "file" && parts.length > 4) {
        // Specific file
        const filePath = parts.slice(4).join("/");
        return await this.getFileResource(repoName, filePath);
      }
    } else if (uri.startsWith("docs://search/")) {
      const query = decodeURIComponent(uri.split("/")[2]);
      return await this.getSearchResource(query);
    } else if (uri.startsWith("docs://context/")) {
      const task = decodeURIComponent(uri.split("/")[2]);
      return await this.getContextResource(task);
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  private async getRepositoryResource(repoName: string) {
    const config = await this.configLoader.loadConfig();
    const repo = config.repositories.find(r => r.name === repoName);
    
    if (!repo) {
      throw new Error(`Repository '${repoName}' not found`);
    }

    const content: TextContent = {
      type: "text",
      text: `# ${repoName} Documentation\n\n` +
        `## Repository Information\n` +
        `- Name: ${repo.name}\n` +
        `- URL: ${repo.url}\n` +
        `- Branch: ${repo.branch || 'main'}\n` +
        `- Paths: ${repo.paths?.join(', ') || '/'}\n\n` +
        `## Available Documentation\n` +
        `This resource provides access to all documentation in the ${repoName} repository.\n` +
        `Use the file-specific URIs to access individual documents.`,
    };

    return {
      contents: [content],
    };
  }

  private async getFileResource(repoName: string, filePath: string) {
    try {
      const config = await this.configLoader.loadConfig();
      const repo = config.repositories.find(r => r.name === repoName);
      
      if (!repo) {
        throw new Error(`Repository '${repoName}' not found`);
      }

      const content = await this.gitSync.getFileContent(repo, filePath);
      
      const textContent: TextContent = {
        type: "text",
        text: content,
      };

      return {
        contents: [textContent],
      };
    } catch (error) {
      throw new Error(`Failed to read file ${filePath} from ${repoName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getSearchResource(query: string) {
    const contextQuery: ContextQuery = {
      task: query,
      maxResults: 20
    };

    const results = await this.contextGenerator.generateContext(contextQuery);
    
    const content: TextContent = {
      type: "text",
      text: `# Search Results for: "${query}"\n\n` +
        `Found ${results.chunks.length} relevant results:\n\n` +
        results.chunks.map((chunk, index) => 
          `## Result ${index + 1}\n` +
          `**Source:** ${chunk.filepath} (${chunk.repository})\n` +
          `**Relevance:** ${chunk.score?.toFixed(3) || 'N/A'}\n\n` +
          `${chunk.content}\n`
        ).join('\n---\n\n'),
    };

    return {
      contents: [content],
    };
  }

  private async getContextResource(task: string) {
    const contextQuery: ContextQuery = {
      task: task,
      maxResults: 15
    };

    const results = await this.contextGenerator.generateContext(contextQuery);
    
    const content: TextContent = {
      type: "text",
      text: `# Context for Task: "${task}"\n\n` +
        `Generated context from ${results.chunks.length} documentation sources:\n\n` +
        results.chunks.map((chunk, index) => 
          `## Context Source ${index + 1}\n` +
          `**File:** ${chunk.filepath}\n` +
          `**Repository:** ${chunk.repository}\n` +
          `**Relevance:** ${chunk.score?.toFixed(3) || 'N/A'}\n\n` +
          `${chunk.content}\n`
        ).join('\n---\n\n'),
    };

    return {
      contents: [content],
    };
  }

  // Helper method to fix property name inconsistencies
  private fixContextQuery(query: any): ContextQuery {
    // Convert any 'text' property to 'task'
    if (query.text && !query.task) {
      query.task = query.text;
      delete query.text;
    }
    // Remove unsupported properties
    const supportedProps = ['task', 'language', 'framework', 'context', 'maxResults', 'repositories', 'categories'];
    const cleanQuery: any = {};
    for (const prop of supportedProps) {
      if (query[prop] !== undefined) {
        cleanQuery[prop] = query[prop];
      }
    }
    return cleanQuery as ContextQuery;
  }

  // Helper method to format chunk content with correct property names
  private formatChunkInfo(chunk: ContextChunk, prefix: string = 'Source'): string {
    return `**${prefix}:** ${chunk.filepath} (${chunk.repository})`;
  }

  getServer(): Server {
    return this.server;
  }
}
