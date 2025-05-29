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

let server: MCPServer | null = null;
const maxRestarts = 3;
let restartCount = 0;
let lastRestartTime = 0;

async function startServer() {
  try {
    server = new MCPServer();
    
    // Setup graceful shutdown
    gracefulShutdown.addTask(createShutdownTasks.cleanup(
      async () => {
        if (server) {
          await server.stop();
          server = null;
        }
      },
      'MCP Server'
    ));

    gracefulShutdown.setupSignalHandlers();

    // Start the server
    await server.start();
    
    // Reset restart counter after successful startup
    setTimeout(() => {
      restartCount = 0;
    }, 60000); // Reset after 1 minute of stable operation
    
    return true;
  } catch (error) {
    // Use stderr for errors
    console.error('Failed to start MCP Server:', error);
    return false;
  }
}

async function restartServerIfNeeded() {
  const now = Date.now();
  
  // If restarting too frequently, limit it
  if (now - lastRestartTime < 5000) {
    console.warn('Attempted to restart too quickly, delaying...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  if (restartCount >= maxRestarts) {
    console.error(`Exceeded maximum restart attempts (${maxRestarts}). Server will not be restarted.`);
    return false;
  }
  
  console.warn(`Attempting to restart server (attempt ${restartCount + 1}/${maxRestarts})...`);
  restartCount++;
  lastRestartTime = Date.now();
  
  return await startServer();
}

// Handle uncaught errors gracefully - try to recover instead of terminating
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  
  // Try to restart the server if it crashed
  if (await restartServerIfNeeded()) {
    console.warn('Server restarted after uncaught exception');
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  
  // Try to restart the server if it crashed
  if (await restartServerIfNeeded()) {
    console.warn('Server restarted after unhandled rejection');
  } else {
    process.exit(1);
  }
});

// Handle IPC disconnect for Claude and VS Code integration
process.on('disconnect', async () => {
  console.warn('IPC disconnect detected. Parent process may have terminated.');
  // Don't exit, just log the event
});

// Keep the connection alive with a noop timer
const keepAliveTimer = setInterval(() => {
  // This interval keeps the event loop active
  // Force garbage collection periodically if available
  if (global.gc && Math.random() < 0.1) { // Randomly do GC 10% of the time
    global.gc();
  }
}, 30000);

// Don't let the timer prevent the process from exiting
keepAliveTimer.unref();

// Start the server
startServer().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});