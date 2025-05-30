import { UnifiedServer, ServerMode } from './unified-server';
import logger from './utils/logger';

// Legacy server.ts - now uses UnifiedServer
// This file maintains backward compatibility for existing deployments

export class MCPServer {
  private unifiedServer: UnifiedServer;

  constructor() {
    // Create unified server in MCP mode for backward compatibility
    this.unifiedServer = new UnifiedServer({
      mode: 'mcp' as ServerMode,
      debug: process.env.NODE_ENV === 'development',
      maxMemory: parseInt(process.env.MAX_MEMORY || '2048')
    });
  }

  async initialize(): Promise<void> {
    await this.unifiedServer.initialize();
  }

  async start(): Promise<void> {
    logger.info('Starting MCP Server (legacy compatibility mode)');
    await this.unifiedServer.start();
  }

  async stop(): Promise<void> {
    await this.unifiedServer.stop();
  }
}

// Main execution for backward compatibility
if (require.main === module) {
  const server = new MCPServer();
  
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
