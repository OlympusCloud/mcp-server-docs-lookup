/**
 * Tool Handler - Manages MCP tool execution
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ServiceManager } from './service-manager';
import logger from '../utils/logger';

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

const StatusSchema = z.object({});

const StatsSchema = z.object({
  repository: z.string().optional().describe("Filter stats by repository (optional)")
});

enum ToolName {
  SEARCH_DOCS = "search_docs",
  GET_CONTEXT = "get_context",
  STATUS = "status", 
  STATS = "stats",
}

export class ToolHandler {
  constructor(private serviceManager: ServiceManager) {}

  listTools() {
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
          name: ToolName.STATUS,
          description: "Get comprehensive server status and health metrics",
          inputSchema: zodToJsonSchema(StatusSchema) as any,
        },
        {
          name: ToolName.STATS,
          description: "Get detailed statistics about indexed documentation",
          inputSchema: zodToJsonSchema(StatsSchema) as any,
        },
      ],
    };
  }

  async callTool(params: { name: string; arguments?: any }) {
    const { name, arguments: args } = params;

    try {
      switch (name) {
        case ToolName.SEARCH_DOCS:
          return await this.handleSearchDocs(SearchDocsSchema.parse(args));
        case ToolName.GET_CONTEXT:
          return await this.handleGetContext(GetContextSchema.parse(args));
        case ToolName.STATUS:
          return await this.handleStatus();
        case ToolName.STATS:
          return await this.handleStats(StatsSchema.parse(args));
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool execution error for ${name}:`, error);
      return {
        content: [
          {
            type: "text",
            text: `Error executing ${name}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearchDocs(params: z.infer<typeof SearchDocsSchema>) {
    const contextGenerator = this.serviceManager.getContextGenerator();
    
    const contextResult = await contextGenerator.generateContext({
      task: params.query,
      language: params.language,
      framework: params.framework,
      repositories: params.repositories,
      maxResults: params.maxResults,
    });

    return {
      content: [
        {
          type: "text",
          text: `Found ${contextResult.results.length} documentation results:\n\n` +
                contextResult.results.map((result, i) => 
                  `${i + 1}. **${result.metadata.title || 'Untitled'}** (Score: ${result.score?.toFixed(3) || 'N/A'})\n` +
                  `   Repository: ${result.repository}\n` +
                  `   Path: ${result.filepath}\n` +
                  `   ${result.content.substring(0, 200)}...\n`
                ).join('\n'),
        },
      ],
    };
  }

  private async handleGetContext(params: z.infer<typeof GetContextSchema>) {
    const contextGenerator = this.serviceManager.getContextGenerator();
    
    const contextResult = await contextGenerator.generateContext({
      task: params.task,
      language: params.language,
      framework: params.framework,
      maxResults: params.maxChunks,
    });

    return {
      content: [
        {
          type: "text",
          text: `Generated context for task: "${params.task}"\n\n` +
                `Relevant documentation chunks (${contextResult.chunks.length}):\n\n` +
                contextResult.chunks.map((chunk, i) => 
                  `${i + 1}. **${chunk.metadata?.title || 'Untitled'}**\n` +
                  `   Repository: ${chunk.repository}\n` +
                  `   Path: ${chunk.filepath}\n` +
                  `   ${chunk.content.substring(0, 300)}...\n`
                ).join('\n'),
        },
      ],
    };
  }

  private async handleStatus() {
    const vectorStore = this.serviceManager.getVectorStore();
    
    const stats = await vectorStore.getStats();
    const memoryUsage = process.memoryUsage();
    
    return {
      content: [
        {
          type: "text",
          text: `**Olympus Docs Server Status**\n\n` +
                `**Vector Store:**\n` +
                `- Total Documents: ${stats.totalDocuments}\n` +
                `- Total Chunks: ${stats.totalChunks}\n` +
                `- Collection Size: ${stats.collectionSize}\n\n` +
                `**Memory Usage:**\n` +
                `- Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n` +
                `- Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB\n` +
                `- RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB\n\n` +
                `**Services:**\n` +
                `- Initialized: ${this.serviceManager.isInitialized() ? '✅' : '❌'}\n` +
                `- Uptime: ${Math.floor(process.uptime())} seconds`,
        },
      ],
    };
  }

  private async handleStats(params: z.infer<typeof StatsSchema>) {
    const vectorStore = this.serviceManager.getVectorStore();
    
    // Get basic stats
    const stats = await vectorStore.getStats();
    
    let content = `**Documentation Statistics**\n\n` +
                  `Total Documents: ${stats.totalDocuments}\n` +
                  `Total Chunks: ${stats.totalChunks}\n` +
                  `Collection Size: ${stats.collectionSize}\n`;

    if (params.repository) {
      // Use searchByMetadata instead of search for repository filtering
      const results = await vectorStore.searchByMetadata({ repository: params.repository });
      
      content += `\n**Repository: ${params.repository}**\n` +
                 `Documents: ${results.length}\n`;
    }

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  }
}
