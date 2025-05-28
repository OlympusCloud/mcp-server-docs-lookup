#!/usr/bin/env node

/**
 * Olympus AI CLI - Quick search interface
 */

const { spawn } = require('child_process');
const path = require('path');

// Get the command and arguments
const [command, ...args] = process.argv.slice(2);

// Map commands to CLI commands
const commandMap = {
  'search': 'search',
  'implement': 'olympus implement',
  'integrate': 'olympus integrate',
  'architecture': 'olympus architecture',
  'security': 'search "security best practices"',
  'deploy': 'search "deployment configuration"',
  'test': 'search "testing patterns"',
  'standards': 'search "coding standards"',
};

// Get the actual command
const actualCommand = commandMap[command] || 'search';
const searchQuery = actualCommand === 'search' ? args.join(' ') : args.join(' ');

// Build the full command
const cliPath = path.join(__dirname, 'dist', 'cli.js');
const fullArgs = actualCommand.split(' ');

if (searchQuery) {
  fullArgs.push(searchQuery);
}

// Run the CLI
const child = spawn(process.execPath, [cliPath, ...fullArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    OLYMPUS_MODE: 'true',
  },
});

child.on('error', (error) => {
  console.error('Failed to execute command:', error.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});