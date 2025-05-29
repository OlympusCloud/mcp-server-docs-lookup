/**
 * Resource Handler - Manages MCP resources
 */
import { Resource } from "@modelcontextprotocol/sdk/types.js";
import { ServiceManager } from './service-manager';

export class ResourceHandler {
  constructor(private serviceManager: ServiceManager) {}

  async listResources(_params?: { cursor?: string }): Promise<{ resources: Resource[] }> {
    // For now, return a simple set of available resource types
    const resources: Resource[] = [
      {
        uri: "docs://status",
        name: "Server Status",
        description: "Current server status and health metrics",
        mimeType: "text/plain"
      },
      {
        uri: "docs://stats",
        name: "Documentation Statistics",
        description: "Statistics about indexed documentation",
        mimeType: "text/plain"
      }
    ];

    return { resources };
  }

  async readResource(params: { uri: string }): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    const { uri } = params;

    switch (uri) {
      case "docs://status":
        return await this.getServerStatus(uri);
      case "docs://stats":
        return await this.getDocumentationStats(uri);
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  private async getServerStatus(uri: string) {
    const vectorStore = this.serviceManager.getVectorStore();
    const stats = await vectorStore.getStats();
    const memoryUsage = process.memoryUsage();
    
    const statusText = `Olympus Docs Server Status

Vector Store:
- Total Documents: ${stats.totalDocuments}
- Total Chunks: ${stats.totalChunks}
- Collection Size: ${stats.collectionSize}

Memory Usage:
- Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
- Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB
- RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB

Services:
- Initialized: ${this.serviceManager.isInitialized() ? 'Yes' : 'No'}
- Uptime: ${Math.floor(process.uptime())} seconds`;

    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: statusText
        }
      ]
    };
  }

  private async getDocumentationStats(uri: string) {
    const vectorStore = this.serviceManager.getVectorStore();
    const stats = await vectorStore.getStats();
    
    const statsText = `Documentation Statistics

Total Documents: ${stats.totalDocuments}
Total Chunks: ${stats.totalChunks}
Collection Size: ${stats.collectionSize}

Last Updated: ${new Date().toISOString()}`;

    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: statsText
        }
      ]
    };
  }
}
