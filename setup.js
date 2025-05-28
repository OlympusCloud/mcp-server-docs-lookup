#!/usr/bin/env node

/**
 * MCP Server Setup Router
 * Automatically detects context and runs appropriate setup
 */

const fs = require('fs');
const path = require('path');

// Check if we're in an Olympus Cloud context
const isOlympusContext = () => {
  // Check for Olympus indicators
  const indicators = [
    '.olympus',
    'olympus.config.json',
    path.join(process.cwd(), '..', 'olympus-cloud'),
    path.join(process.cwd(), '..', '..', 'olympus-cloud'),
  ];
  
  // Check environment variables
  if (process.env.OLYMPUS_CLOUD || process.env.OLYMPUS_MODE) {
    return true;
  }
  
  // Check current directory name
  if (process.cwd().includes('olympus')) {
    return true;
  }
  
  // Check for any Olympus indicators
  return indicators.some(indicator => {
    try {
      fs.accessSync(indicator);
      return true;
    } catch {
      return false;
    }
  });
};

// Parse command line arguments
const args = process.argv.slice(2);
const forceOlympus = args.includes('--olympus') || args.includes('-o');
const forceGeneral = args.includes('--general') || args.includes('-g');

// Determine which setup to run
let setupScript;

if (forceOlympus) {
  setupScript = './setup-olympus.js';
  console.log('🏛️  Running Olympus Cloud setup (forced)...\n');
} else if (forceGeneral) {
  setupScript = './setup-general.js';
  console.log('🔧 Running general setup (forced)...\n');
} else if (isOlympusContext()) {
  setupScript = './setup-olympus.js';
  console.log('🏛️  Detected Olympus Cloud context, running Olympus setup...\n');
  console.log('   (Use --general to force general setup)\n');
} else {
  // Default to Olympus setup with prompt
  console.log('🤔 Which setup would you like to run?\n');
  console.log('1. Olympus Cloud Setup (recommended) - Full Olympus ecosystem support');
  console.log('2. General Setup - Basic MCP server for any documentation\n');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('Enter your choice (1 or 2): ', (answer) => {
    rl.close();
    
    if (answer === '2') {
      require('./setup-general.js');
    } else {
      require('./setup-olympus.js');
    }
  });
  
  return; // Exit early, setup will be run after user input
}

// Run the selected setup
require(setupScript);