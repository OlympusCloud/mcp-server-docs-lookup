#!/usr/bin/env node

/**
 * MCP Server Launcher
 * Handles both global and local installations for VS Code integration
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if running in stdio mode
const isStdio = process.argv.includes('--stdio');

// Possible locations for the server
const possiblePaths = [
  // Local installation in current project
  path.join(process.cwd(), 'node_modules', '@olympuscloud', 'mcp-docs-server', 'dist', 'server.js'),
  // Global npm installation
  path.join(require.resolve('@olympuscloud/mcp-docs-server'), '..', 'server.js'),
  // Development mode (running from source)
  path.join(__dirname, 'dist', 'server.js'),
  // Fallback to CLI
  path.join(__dirname, 'dist', 'cli.js'),
];

function findServer() {
  for (const serverPath of possiblePaths) {
    if (fs.existsSync(serverPath)) {
      return serverPath;
    }
  }
  
  // If no server found, try to run the CLI directly
  return null;
}

function startServer() {
  const serverPath = findServer();
  
  if (!serverPath) {
    console.error('MCP Server Error: Could not find server executable');
    console.error('Please ensure @olympuscloud/mcp-docs-server is installed:');
    console.error('  npm install -g @olympuscloud/mcp-docs-server');
    console.error('  or');
    console.error('  npm install @olympuscloud/mcp-docs-server');
    process.exit(1);
  }

  // Prepare Node.js arguments
  const nodeArgs = [
    '--expose-gc',
    '--max-old-space-size=4096',
    serverPath,
  ];

  // Add stdio flag if present
  if (isStdio) {
    nodeArgs.push('--stdio');
  }

  // Pass through any other arguments
  const otherArgs = process.argv.slice(2).filter(arg => arg !== '--stdio');
  nodeArgs.push(...otherArgs);

  // Spawn the server
  const serverProcess = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      MCP_MODE: 'true',
      NODE_ENV: process.env.NODE_ENV || 'production',
    },
  });

  // Handle process events
  serverProcess.on('error', (error) => {
    console.error('Failed to start MCP server:', error.message);
    process.exit(1);
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== null) {
      process.exit(code);
    } else if (signal) {
      console.error(`Server terminated by signal: ${signal}`);
      process.exit(1);
    }
  });

  // Forward signals to the server
  process.on('SIGINT', () => {
    serverProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    serverProcess.kill('SIGTERM');
  });
}

// Start the server
startServer();