#!/usr/bin/env node

/**
 * Main entry point for the modular MCP server
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MCPServer } from './core/server';
import logger from './utils/logger';

// Set MCP mode environment variable
process.env.MCP_MODE = 'true';

// Override console methods to prevent stdout pollution in MCP mode
if (!process.env.MCP_DEBUG) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  // Keep error and warn going to stderr
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.error = (...args: any[]) => {
    originalError('[MCP-ERROR]', ...args);
  };
  
  console.warn = (...args: any[]) => {
    originalWarn('[MCP-WARN]', ...args);
  };
}

async function main() {
  try {
    const server = new MCPServer();
    const transport = new StdioServerTransport();
    
    await server.connect(transport);
    logger.info('Modular MCP Server started successfully');
    
    // Handle process termination
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...');
      await server.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...');
      await server.shutdown();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start modular MCP server:', error);
    process.exit(1);
  }
}

main();
