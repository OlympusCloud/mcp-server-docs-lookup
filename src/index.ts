#!/usr/bin/env node

// Main entry point for the MCP Docs Server
// This file automatically detects the best server mode based on environment

import { UnifiedServer, ServerMode, UnifiedServerConfig } from './unified-server';
import logger from './utils/logger';

async function main() {
  // Detect server mode based on environment and arguments
  let mode: ServerMode = 'mcp'; // Default to MCP mode
  
  if (process.env.MCP_MODE === 'api' || process.argv.includes('--api')) {
    mode = 'api';
  } else if (process.env.MCP_MODE === 'enhanced' || process.argv.includes('--enhanced')) {
    mode = 'enhanced';
  } else if (process.env.MCP_MODE === 'websocket' || process.argv.includes('--websocket')) {
    mode = 'websocket';
  }

  const config: UnifiedServerConfig = {
    mode,
    port: parseInt(process.env.PORT || '3000'),
    enableWebSocket: process.env.ENABLE_WEBSOCKET === 'true',
    enableMetrics: process.env.ENABLE_METRICS !== 'false', // Default to true
    maxMemory: parseInt(process.env.MAX_MEMORY || '2048'),
    debug: process.env.NODE_ENV === 'development'
  };

  logger.info(`Starting MCP Docs Server in ${mode} mode`, {
    port: config.port,
    enableWebSocket: config.enableWebSocket,
    enableMetrics: config.enableMetrics,
    maxMemory: config.maxMemory
  });

  const server = new UnifiedServer(config);

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await server.stop();
      logger.info('Server shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await server.start();
    logger.info('🚀 MCP Docs Server started successfully');
    
    if (mode === 'api' || mode === 'websocket') {
      logger.info(`Server listening on port ${config.port}`);
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
