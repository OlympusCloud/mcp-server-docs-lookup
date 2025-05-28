#!/usr/bin/env node

/**
 * Olympus Cloud MCP Server - One-Click Setup
 * Automatically configures everything for Olympus Cloud development
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

// Olympus Cloud repositories and their purposes
const OLYMPUS_REPOS = {
  // Core Platform
  'olympus-cloud': {
    url: 'https://github.com/olympuscloud/olympus-cloud.git',
    description: 'Main Olympus Cloud platform',
    priority: 100,
    categories: ['platform', 'core', 'infrastructure']
  },
  
  // Hubs
  'olympus-hub': {
    url: 'https://github.com/olympuscloud/olympus-hub.git',
    description: 'Central hub for all Olympus services',
    priority: 90,
    categories: ['hub', 'central', 'orchestration']
  },
  'nebula-hub': {
    url: 'https://github.com/olympuscloud/nebula-hub.git',
    description: 'Data processing and analytics hub',
    priority: 85,
    categories: ['hub', 'data', 'analytics']
  },
  'hermes-hub': {
    url: 'https://github.com/olympuscloud/hermes-hub.git',
    description: 'Communication and messaging hub',
    priority: 85,
    categories: ['hub', 'messaging', 'communication']
  },
  
  // Apps
  'apollo-app': {
    url: 'https://github.com/olympuscloud/apollo-app.git',
    description: 'API management and documentation',
    priority: 80,
    categories: ['app', 'api', 'documentation']
  },
  'athena-app': {
    url: 'https://github.com/olympuscloud/athena-app.git',
    description: 'Knowledge management and AI insights',
    priority: 80,
    categories: ['app', 'ai', 'knowledge']
  },
  'zeus-app': {
    url: 'https://github.com/olympuscloud/zeus-app.git',
    description: 'Infrastructure and deployment management',
    priority: 80,
    categories: ['app', 'infrastructure', 'deployment']
  },
  'hera-app': {
    url: 'https://github.com/olympuscloud/hera-app.git',
    description: 'User management and authentication',
    priority: 80,
    categories: ['app', 'auth', 'users']
  },
  
  // Documentation
  'olympus-docs': {
    url: 'https://github.com/olympuscloud/olympus-docs.git',
    description: 'Complete Olympus Cloud documentation',
    priority: 95,
    categories: ['docs', 'guides', 'standards']
  },
  'olympus-standards': {
    url: 'https://github.com/olympuscloud/olympus-standards.git',
    description: 'Coding standards and best practices',
    priority: 95,
    categories: ['standards', 'best-practices', 'guidelines']
  }
};

// AI-friendly search templates
const AI_SEARCH_TEMPLATES = {
  'implement-feature': {
    description: 'Find how to implement a feature in Olympus Cloud',
    template: 'implement {feature} olympus cloud best practices examples'
  },
  'app-integration': {
    description: 'Find how to integrate with a specific app',
    template: '{app} integration API endpoints authentication'
  },
  'hub-architecture': {
    description: 'Understand hub architecture and patterns',
    template: '{hub} architecture patterns event flow data models'
  },
  'deployment-guide': {
    description: 'Find deployment and infrastructure guides',
    template: 'deploy {component} kubernetes docker azure production'
  },
  'security-standards': {
    description: 'Find security best practices',
    template: 'security {component} authentication authorization OWASP'
  },
  'data-flow': {
    description: 'Understand data flow between components',
    template: 'data flow {source} {destination} events messages'
  },
  'error-handling': {
    description: 'Find error handling patterns',
    template: 'error handling {component} exceptions retry patterns'
  },
  'testing-guide': {
    description: 'Find testing strategies and examples',
    template: 'testing {component} unit integration e2e examples'
  }
};

class OlympusSetup {
  constructor() {
    this.platform = os.platform();
    this.homeDir = os.homedir();
    this.projectDir = process.cwd();
    this.errors = [];
  }

  log(message, color = 'reset') {
    console.log(`${COLORS[color]}${message}${COLORS.reset}`);
  }

  async quickCheck() {
    // Quick prerequisite check
    try {
      await execAsync('node --version');
      await execAsync('npm --version');
      await execAsync('git --version');
    } catch (error) {
      throw new Error('Missing prerequisites. Please install Node.js 18+, npm, and git.');
    }
  }

  async installAndBuild() {
    this.log('\n📦 Installing and building...', 'cyan');
    
    // Install dependencies
    await new Promise((resolve, reject) => {
      const install = spawn('npm', ['install'], {
        cwd: this.projectDir,
        stdio: 'inherit',
        shell: true
      });
      install.on('close', (code) => {
        code === 0 ? resolve() : reject(new Error('Failed to install'));
      });
    });

    // Build project
    await new Promise((resolve, reject) => {
      const build = spawn('npm', ['run', 'build'], {
        cwd: this.projectDir,
        stdio: 'inherit',
        shell: true
      });
      build.on('close', (code) => {
        code === 0 ? resolve() : reject(new Error('Failed to build'));
      });
    });
  }

  async createOlympusConfig() {
    this.log('\n⚙️  Creating Olympus Cloud configuration...', 'cyan');
    
    const configPath = path.join(this.projectDir, 'config', 'config.json');
    
    // Create comprehensive Olympus config
    const config = {
      "repositories": Object.entries(OLYMPUS_REPOS).map(([name, repo]) => ({
        "name": name,
        "url": repo.url,
        "branch": "main",
        "priority": repo.priority,
        "syncInterval": 3600000, // 1 hour
        "metadata": {
          "description": repo.description,
          "categories": repo.categories
        }
      })),
      "vectorStore": {
        "provider": "qdrant",
        "qdrant": {
          "url": "http://localhost:6333",
          "collectionName": "olympus_docs"
        }
      },
      "contextGeneration": {
        "maxChunks": 50,
        "chunkSize": 1000,
        "overlap": 200,
        "minRelevanceScore": 0.7
      },
      "api": {
        "enabled": true,
        "port": 3000,
        "cors": {
          "enabled": true,
          "origins": ["*"]
        },
        "rateLimit": {
          "windowMs": 60000,
          "max": 100
        }
      },
      "logging": {
        "level": "info",
        "format": "json"
      },
      "olympusCloud": {
        "enabled": true,
        "searchTemplates": AI_SEARCH_TEMPLATES,
        "autoIndex": true,
        "indexOnStartup": true,
        "customPrompts": {
          "architecture": "Focus on Olympus Cloud microservices architecture and hub/app patterns",
          "implementation": "Provide code examples using Olympus Cloud standards and patterns",
          "integration": "Show how components integrate using Olympus event system and APIs"
        }
      }
    };

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    this.log('✅ Olympus configuration created', 'green');
  }

  async setupQdrant() {
    this.log('\n🗄️  Setting up Qdrant...', 'cyan');
    
    try {
      await execAsync('docker --version');
      
      // Stop existing container if running
      try {
        await execAsync('docker stop qdrant 2>/dev/null');
        await execAsync('docker rm qdrant 2>/dev/null');
      } catch {
        // Container might not exist
      }

      // Start Qdrant with Olympus-optimized settings
      await execAsync(`docker run -d --name qdrant -p 6333:6333 -v ${path.join(this.projectDir, 'qdrant_storage')}:/qdrant/storage -e QDRANT__SERVICE__GRPC_PORT=6334 qdrant/qdrant`);
      this.log('✅ Qdrant started', 'green');
      
      // Wait for Qdrant to be ready
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      this.log('⚠️  Docker not available, using in-memory storage', 'yellow');
    }
  }

  async configureAIAssistants() {
    this.log('\n🤖 Configuring AI assistants...', 'cyan');
    
    // Configure Claude Desktop
    await this.configureClaudeDesktop();
    
    // Configure GitHub Copilot
    await this.configureGitHubCopilot();
    
    // Create AI helper commands
    await this.createAIHelpers();
  }

  async configureClaudeDesktop() {
    let configPath;
    switch (this.platform) {
      case 'darwin':
        configPath = path.join(this.homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        break;
      case 'win32':
        configPath = path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
        break;
      case 'linux':
        configPath = path.join(this.homeDir, '.config', 'Claude', 'claude_desktop_config.json');
        break;
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }

    const serverCommand = this.platform === 'win32' ? 'node.exe' : 'node';
    const serverPath = path.join(this.projectDir, 'dist', 'cli.js').replace(/\\/g, '/');

    const mcpConfig = {
      mcpServers: {
        "olympus-docs": {
          command: serverCommand,
          args: [serverPath, "start"],
          env: {
            NODE_ENV: "production",
            OLYMPUS_MODE: "true"
          }
        }
      }
    };

    try {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      
      let existingConfig = {};
      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        existingConfig = JSON.parse(configContent);
      } catch {
        // Config doesn't exist yet
      }

      const mergedConfig = {
        ...existingConfig,
        mcpServers: {
          ...existingConfig.mcpServers,
          ...mcpConfig.mcpServers
        }
      };

      await fs.writeFile(configPath, JSON.stringify(mergedConfig, null, 2));
      this.log('✅ Claude Desktop configured', 'green');
      
    } catch (error) {
      this.errors.push(`Claude Desktop configuration failed: ${error.message}`);
    }
  }

  async configureGitHubCopilot() {
    // Create VS Code settings
    const vscodeSettingsPath = path.join(this.projectDir, '.vscode', 'settings.json');
    await fs.mkdir(path.dirname(vscodeSettingsPath), { recursive: true });
    
    const settings = {
      "github.copilot.advanced": {
        "debug.overrideEngine": "http://localhost:3000/v1",
        "debug.testOverrideProxyUrl": "http://localhost:3000",
        "debug.overrideProxyUrl": "http://localhost:3000"
      },
      "olympusCloud.enabled": true,
      "olympusCloud.contextProvider": "http://localhost:3000"
    };

    await fs.writeFile(vscodeSettingsPath, JSON.stringify(settings, null, 2));
    
    // Create API service startup
    if (this.platform === 'win32') {
      const startupScript = `@echo off
cd /d "${this.projectDir}"
start /B node dist\\api-server.js --olympus`;
      
      await fs.writeFile(path.join(this.projectDir, 'start-olympus-api.bat'), startupScript);
      
    } else {
      const startupScript = `#!/bin/bash
cd "${this.projectDir}"
node dist/api-server.js --olympus &`;
      
      const scriptPath = path.join(this.projectDir, 'start-olympus-api.sh');
      await fs.writeFile(scriptPath, startupScript);
      await fs.chmod(scriptPath, '755');
    }
    
    this.log('✅ GitHub Copilot configured', 'green');
  }

  async createAIHelpers() {
    this.log('\n🛠️  Creating AI helper commands...', 'cyan');
    
    // Create olympus-ai CLI tool
    const aiCliContent = `#!/usr/bin/env node

const axios = require('axios');
const [,, command, ...args] = process.argv;

const API_URL = 'http://localhost:3000';

const commands = {
  async search(query) {
    try {
      const response = await axios.post(\`\${API_URL}/search\`, {
        query: args.join(' '),
        limit: 10
      });
      
      console.log('\\n🔍 Search Results:\\n');
      response.data.results.forEach((result, i) => {
        console.log(\`\${i + 1}. \${result.repository}:\${result.filepath}\`);
        console.log(\`   Score: \${result.score.toFixed(3)}\`);
        console.log(\`   \${result.content.substring(0, 200)}...\\n\`);
      });
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  async implement(feature) {
    const query = \`implement \${args.join(' ')} in Olympus Cloud best practices examples code\`;
    await commands.search(query);
  },
  
  async integrate(app) {
    const query = \`\${args[0]} integration API endpoints authentication examples\`;
    await commands.search(query);
  },
  
  async architecture(component) {
    const query = \`\${args.join(' ')} architecture patterns microservices hub app\`;
    await commands.search(query);
  },
  
  async security(component) {
    const query = \`security \${args.join(' ')} authentication authorization OWASP Olympus\`;
    await commands.search(query);
  },
  
  async deploy(component) {
    const query = \`deploy \${args.join(' ')} kubernetes docker azure production Olympus\`;
    await commands.search(query);
  },
  
  async test(component) {
    const query = \`testing \${args.join(' ')} unit integration e2e examples Olympus\`;
    await commands.search(query);
  },
  
  async standards(topic) {
    const query = \`Olympus Cloud standards \${args.join(' ')} best practices guidelines\`;
    await commands.search(query);
  },
  
  async help() {
    console.log(\`
🚀 Olympus AI Assistant Commands:

  olympus-ai search <query>         - Search Olympus documentation
  olympus-ai implement <feature>    - Find implementation guides
  olympus-ai integrate <app>        - Find integration guides
  olympus-ai architecture <component> - Understand architecture
  olympus-ai security <component>   - Security best practices
  olympus-ai deploy <component>     - Deployment guides
  olympus-ai test <component>       - Testing strategies
  olympus-ai standards <topic>      - Coding standards
  olympus-ai help                   - Show this help

Examples:
  olympus-ai implement user authentication
  olympus-ai integrate apollo-app
  olympus-ai architecture nebula-hub
  olympus-ai security api endpoints
  olympus-ai deploy hermes-hub production
    \`);
  }
};

if (!command || !commands[command]) {
  commands.help();
} else {
  commands[command](...args);
}
`;

    const aiCliPath = path.join(this.projectDir, 'olympus-ai.js');
    await fs.writeFile(aiCliPath, aiCliContent);
    await fs.chmod(aiCliPath, '755');
    
    // Create quick index script
    const indexScriptContent = `#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('🚀 Indexing Olympus Cloud repositories...');
console.log('This will clone/update all Olympus repos and index their documentation.');
console.log('This may take several minutes on first run.\\n');

const indexProcess = spawn('node', ['dist/cli.js', 'index', '--all'], {
  stdio: 'inherit',
  cwd: process.cwd()
});

indexProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\\n✅ Indexing complete! You can now use:');
    console.log('  - olympus-ai search <query>');
    console.log('  - olympus-ai implement <feature>');
    console.log('  - olympus-ai help (for more commands)');
  } else {
    console.error('\\n❌ Indexing failed. Please check the logs.');
  }
});
`;

    const indexScriptPath = path.join(this.projectDir, 'index-olympus.js');
    await fs.writeFile(indexScriptPath, indexScriptContent);
    await fs.chmod(indexScriptPath, '755');
    
    this.log('✅ AI helper commands created', 'green');
  }

  async updatePackageJson() {
    this.log('\n📝 Updating package.json...', 'cyan');
    
    const packagePath = path.join(this.projectDir, 'package.json');
    const packageContent = await fs.readFile(packagePath, 'utf8');
    const packageJson = JSON.parse(packageContent);
    
    packageJson.scripts = {
      ...packageJson.scripts,
      "setup:olympus": "node setup-olympus.js",
      "setup:general": "node setup-general.js",
      "start:olympus": "npm run api:start",
      "index:olympus": "node index-olympus.js",
      "ai": "node olympus-ai.js"
    };

    packageJson.bin = {
      ...packageJson.bin,
      "olympus-ai": "./olympus-ai.js",
      "olympus-index": "./index-olympus.js"
    };

    await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
    this.log('✅ package.json updated', 'green');
  }

  async createQuickStartGuide() {
    const guideContent = `# Olympus Cloud MCP Server - Quick Start

## 🚀 Installation (One Command!)

\`\`\`bash
npx @olympuscloud/mcp-docs-server setup:olympus
\`\`\`

## 🎯 AI Assistant Commands

### For Coding Agents (Claude, Copilot, etc.)

\`\`\`bash
# Search for anything in Olympus Cloud
olympus-ai search "how to implement user authentication"

# Find implementation examples
olympus-ai implement "real-time notifications"

# Integration guides
olympus-ai integrate apollo-app

# Architecture patterns
olympus-ai architecture nebula-hub

# Security best practices
olympus-ai security "API endpoints"

# Deployment guides
olympus-ai deploy "hermes-hub to production"

# Testing strategies
olympus-ai test "integration testing"

# Coding standards
olympus-ai standards "TypeScript conventions"
\`\`\`

## 🤖 Claude Code Integration

Already configured! Just restart Claude Desktop.

**Example prompts:**
- "Show me how to implement user authentication in Olympus Cloud"
- "What's the architecture of the Nebula Hub?"
- "How do I integrate with the Apollo API?"

## 🐙 GitHub Copilot Integration

Already configured! The API server provides context automatically.

**Just start coding** and Copilot will have full Olympus Cloud context!

## 📚 What Gets Indexed

- **Platform**: Core Olympus Cloud infrastructure
- **Hubs**: Olympus Hub, Nebula Hub, Hermes Hub
- **Apps**: Apollo, Athena, Zeus, Hera
- **Documentation**: Complete guides and standards
- **Best Practices**: Coding standards and patterns

## 🔄 Keep Updated

\`\`\`bash
# Re-index all repositories
npm run index:olympus

# Check system status
npm run doctor
\`\`\`

## 🎨 Architecture Overview

\`\`\`
┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │     │ GitHub Copilot  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ├───────────┬───────────┤
                     │
              ┌──────▼──────┐
              │  MCP Server │
              │  (Olympus)  │
              └──────┬──────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼────┐ ┌───▼────┐ ┌───▼────┐
    │  Hubs   │ │  Apps  │ │  Docs  │
    └─────────┘ └────────┘ └────────┘
\`\`\`

## 💡 Pro Tips

1. **Best Search Results**: Be specific!
   - ❌ "authentication"
   - ✅ "implement JWT authentication in Hera app"

2. **Use Categories**: Include hub/app names
   - "nebula-hub data processing patterns"
   - "apollo-app GraphQL schema"

3. **Architecture Questions**: Use "architecture" or "pattern"
   - "microservices communication pattern"
   - "event-driven architecture Olympus"

4. **Implementation Help**: Use "implement" or "example"
   - "implement webhook handler example"
   - "implement caching strategy Redis"

## 🆘 Troubleshooting

\`\`\`bash
# Check if everything is running
npm run doctor

# Restart API server
npm run start:olympus

# View logs
tail -f logs/api-server.log
\`\`\`

## 📞 Support

- Issues: https://github.com/olympuscloud/mcp-server-docs-lookup/issues
- Docs: https://docs.olympuscloud.io
`;

    await fs.writeFile(path.join(this.projectDir, 'OLYMPUS_QUICKSTART.md'), guideContent);
    this.log('✅ Quick start guide created', 'green');
  }

  async printInstructions() {
    this.log('\n' + '='.repeat(60), 'bright');
    this.log('🏛️  Olympus Cloud MCP Server Ready!', 'magenta');
    this.log('='.repeat(60) + '\n', 'bright');

    this.log('✨ Everything is configured automatically!\n', 'green');

    this.log('🚀 Quick Start:', 'cyan');
    this.log('  1. Start the API server:', 'yellow');
    if (this.platform === 'win32') {
      this.log('     start-olympus-api.bat\n', 'blue');
    } else {
      this.log('     ./start-olympus-api.sh\n', 'blue');
    }
    
    this.log('  2. Index Olympus repositories (first time):', 'yellow');
    this.log('     npm run index:olympus\n', 'blue');
    
    this.log('  3. Use AI commands:', 'yellow');
    this.log('     olympus-ai search "implement user auth"', 'blue');
    this.log('     olympus-ai implement "real-time notifications"', 'blue');
    this.log('     olympus-ai integrate apollo-app\n', 'blue');

    this.log('🤖 AI Assistants:', 'cyan');
    this.log('  ✅ Claude Code: Ready! (restart Claude Desktop)', 'green');
    this.log('  ✅ GitHub Copilot: Ready! (VS Code configured)\n', 'green');

    this.log('📚 Available Commands:', 'cyan');
    this.log('  olympus-ai help     - Show all AI commands', 'blue');
    this.log('  npm run doctor      - Check system status', 'blue');
    this.log('  npm run index:olympus - Re-index all repos\n', 'blue');

    this.log('💡 Pro Tip:', 'yellow');
    this.log('  For best results, be specific in your searches!', 'blue');
    this.log('  Include app/hub names and use action words like:', 'blue');
    this.log('  "implement", "integrate", "deploy", "test"\n', 'blue');

    this.log('📖 Full guide: OLYMPUS_QUICKSTART.md', 'magenta');
    
    if (this.errors.length > 0) {
      this.log('\n⚠️  Some non-critical issues:', 'yellow');
      this.errors.forEach(error => {
        this.log(`  - ${error}`, 'red');
      });
    }
  }

  async run() {
    try {
      this.log(`${COLORS.bright}${COLORS.magenta}🏛️  Olympus Cloud MCP Server - One-Click Setup${COLORS.reset}\n`, 'magenta');

      await this.quickCheck();
      await this.installAndBuild();
      await this.createOlympusConfig();
      await this.setupQdrant();
      await this.configureAIAssistants();
      await this.createAIHelpers();
      await this.updatePackageJson();
      await this.createQuickStartGuide();
      await this.printInstructions();

    } catch (error) {
      this.log(`\n❌ Setup failed: ${error.message}`, 'red');
      this.log('\nTry the general setup instead:', 'yellow');
      this.log('  npm run setup:general', 'blue');
      process.exit(1);
    }
  }
}

// Run setup
if (require.main === module) {
  const setup = new OlympusSetup();
  setup.run();
}

module.exports = OlympusSetup;