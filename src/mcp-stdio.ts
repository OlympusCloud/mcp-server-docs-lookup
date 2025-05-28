#!/usr/bin/env node

// MCP Server entry point for stdio communication
// This file ensures clean stdio communication without any console pollution

// Set MCP mode environment variable
process.env.MCP_MODE = 'true';

// Ensure --expose-gc is available
if (!global.gc) {
  console.error('Warning: Garbage collection not exposed. Start with --expose-gc flag for better memory management.');
}

import { MCPServer } from './server';
import { gracefulShutdown, createShutdownTasks } from './utils/graceful-shutdown';

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
  const server = new MCPServer();
  
  // Setup graceful shutdown
  gracefulShutdown.addTask(createShutdownTasks.cleanup(
    async () => {
      await server.stop();
    },
    'MCP Server'
  ));

  gracefulShutdown.setupSignalHandlers();

  // Start the server
  try {
    await server.start();
  } catch (error) {
    // Use stderr for errors
    console.error('Failed to start MCP Server:', error);
    process.exit(1);
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});