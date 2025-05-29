#!/usr/bin/env node

// This script wraps the MCP server process to provide better error handling and logging
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

// Path to the server.js file
const serverPath = path.join(__dirname, '../dist', 'mcp-stdio.js');
const logPath = path.join(__dirname, '../mcp-server.log');

/**
 * Start the MCP server with improved error handling and logging
 */
export function startMCPServerWrapper(): void {
  // Create a log file stream
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n\n--- MCP Server started ${new Date().toISOString()} ---\n\n`);

  // Ensure the NODE_OPTIONS environment variable contains --expose-gc
  if (!process.env.NODE_OPTIONS?.includes('--expose-gc')) {
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --expose-gc --max-old-space-size=4096`.trim();
  }

  // Ensure MCP_MODE is set
  process.env.MCP_MODE = 'true';

  // Start the MCP server as a child process with proper stdio configuration
  const server: ChildProcess = spawn('node', [serverPath, '--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
    env: {
      ...process.env,
      NODE_ENV: 'production'
    }
  });

  // Create a ping interval to keep the connection alive
  const pingInterval = setInterval(() => {
    // Only send ping if stdin is writable
    if (server.stdin?.writable) {
      // Log the ping to our log but not to console
      logStream.write('Sending keep-alive ping\n');
    }
  }, 30000);

  // Don't let the ping interval prevent the process from exiting
  pingInterval.unref();

  // Handle server stdout (forward to our own stdout)
  if (server.stdout) {
    server.stdout.on('data', (data: Buffer) => {
      process.stdout.write(data);
    });

    // Handle errors on stdout pipe
    server.stdout.on('error', (error: Error) => {
      logStream.write(`Server stdout error: ${error.message}\n`);
    });
  }

  // Handle server stderr (write to log file but not to stderr)
  if (server.stderr) {
    server.stderr.on('data', (data: Buffer) => {
      logStream.write(data);
    });

    // Handle errors on stderr pipe
    server.stderr.on('error', (error: Error) => {
      logStream.write(`Server stderr error: ${error.message}\n`);
    });
  }

  // Forward stdin to the server with error handling
  if (server.stdin) {
    process.stdin.on('data', (data: Buffer) => {
      try {
        if (server.stdin?.writable) {
          const success = server.stdin.write(data);
          
          // If the buffer is full, wait for drain event
          if (!success) {
            server.stdin.once('drain', () => {
              if (server.stdin) {
                server.stdin.write(data);
              }
            });
          }
        }
      } catch (error) {
        logStream.write(`Error writing to server stdin: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      }
    });

    // Handle errors on stdin pipe
    server.stdin.on('error', (error: Error) => {
      logStream.write(`Server stdin error: ${error.message}\n`);
    });
  }

  // Handle server exit - don't immediately exit if error code
  server.on('exit', (code: number | null) => {
    clearInterval(pingInterval);
    
    logStream.write(`MCP server exited with code ${code}\n`);
    
    // Close the log stream
    logStream.end();
    
    // Exit with same code
    process.exit(code ?? 1);
  });

  // Handle our own process termination
  process.on('SIGINT', () => {
    logStream.write('Received SIGINT, shutting down server...\n');
    server.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    logStream.write('Received SIGTERM, shutting down server...\n');
    server.kill('SIGTERM');
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logStream.write(`Uncaught exception in wrapper: ${error.message}\n${error.stack}\n`);
    // Don't exit for uncaught exceptions in the wrapper
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logStream.write(`Unhandled rejection in wrapper: ${reason instanceof Error ? reason.message : String(reason)}\n`);
    // Don't exit for unhandled rejections in the wrapper
  });

  // Log startup
  logStream.write('MCP server wrapper started\n');
}

// Run the wrapper if this file is executed directly
if (require.main === module) {
  startMCPServerWrapper();
}
