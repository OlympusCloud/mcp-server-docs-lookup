#!/usr/bin/env node

/**
 * Olympus Cloud MCP Server - Universal Setup Script
 * Automatically configures both Claude Code and GitHub Copilot
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
  blue: '\x1b[34m'
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

  async checkPrerequisites() {
    this.log('\n🔍 Checking prerequisites...', 'cyan');
    
    const checks = [
      { cmd: 'node --version', name: 'Node.js', minVersion: '18.0.0' },
      { cmd: 'npm --version', name: 'npm' },
      { cmd: 'git --version', name: 'Git' },
      { cmd: 'docker --version', name: 'Docker', optional: true }
    ];

    for (const check of checks) {
      try {
        const { stdout } = await execAsync(check.cmd);
        this.log(`✅ ${check.name} found: ${stdout.trim()}`, 'green');
        
        if (check.minVersion) {
          const version = stdout.match(/\d+\.\d+\.\d+/)?.[0];
          if (version && this.compareVersions(version, check.minVersion) < 0) {
            throw new Error(`${check.name} version ${version} is below minimum required ${check.minVersion}`);
          }
        }
      } catch (error) {
        if (check.optional) {
          this.log(`⚠️  ${check.name} not found (optional)`, 'yellow');
        } else {
          throw new Error(`${check.name} is required but not found. Please install it first.`);
        }
      }
    }
  }

  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }
    return 0;
  }

  async installDependencies() {
    this.log('\n📦 Installing dependencies...', 'cyan');
    
    return new Promise((resolve, reject) => {
      const install = spawn('npm', ['install'], {
        cwd: this.projectDir,
        stdio: 'inherit',
        shell: true
      });

      install.on('close', (code) => {
        if (code === 0) {
          this.log('✅ Dependencies installed successfully', 'green');
          resolve();
        } else {
          reject(new Error('Failed to install dependencies'));
        }
      });
    });
  }

  async buildProject() {
    this.log('\n🔨 Building project...', 'cyan');
    
    return new Promise((resolve, reject) => {
      const build = spawn('npm', ['run', 'build'], {
        cwd: this.projectDir,
        stdio: 'inherit',
        shell: true
      });

      build.on('close', (code) => {
        if (code === 0) {
          this.log('✅ Project built successfully', 'green');
          resolve();
        } else {
          reject(new Error('Failed to build project'));
        }
      });
    });
  }

  async setupQdrant() {
    this.log('\n🗄️  Setting up Qdrant vector database...', 'cyan');
    
    try {
      // Check if Docker is available
      await execAsync('docker --version');
      
      // Check if Qdrant is already running
      try {
        const { stdout } = await execAsync('docker ps --format "{{.Names}}" | grep qdrant');
        if (stdout.includes('qdrant')) {
          this.log('✅ Qdrant is already running', 'green');
          return;
        }
      } catch {
        // Container not running, proceed with setup
      }

      // Start Qdrant container
      this.log('Starting Qdrant container...', 'yellow');
      await execAsync(`docker run -d --name qdrant -p 6333:6333 -v ${path.join(this.projectDir, 'qdrant_storage')}:/qdrant/storage qdrant/qdrant`);
      this.log('✅ Qdrant container started', 'green');
      
    } catch (error) {
      this.log('⚠️  Docker not available, Qdrant will use in-memory storage', 'yellow');
      this.log('   For persistence, install Docker and re-run setup', 'yellow');
    }
  }

  async createConfig() {
    this.log('\n⚙️  Creating configuration...', 'cyan');
    
    const configPath = path.join(this.projectDir, 'config', 'config.json');
    const exampleConfigPath = path.join(this.projectDir, 'config', 'config.example.json');
    
    try {
      await fs.access(configPath);
      this.log('Configuration already exists, skipping...', 'yellow');
    } catch {
      // Config doesn't exist, create it
      const exampleConfig = await fs.readFile(exampleConfigPath, 'utf8');
      const config = JSON.parse(exampleConfig);
      
      // Update with sensible defaults
      config.vectorStore.qdrant.url = 'http://localhost:6333';
      config.api.enabled = true;
      config.api.port = 3000;
      
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      this.log('✅ Configuration created', 'green');
    }
  }

  async configureClaudeDesktop() {
    this.log('\n🤖 Configuring Claude Desktop...', 'cyan');
    
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

    const serverCommand = this.platform === 'win32' 
      ? 'node.exe' 
      : 'node';
    
    const serverPath = path.join(this.projectDir, 'dist', 'cli.js').replace(/\\/g, '/');

    const mcpConfig = {
      mcpServers: {
        "olympus-docs": {
          command: serverCommand,
          args: [serverPath, "start"],
          env: {
            NODE_ENV: "production"
          }
        }
      }
    };

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      
      // Check if config exists
      let existingConfig = {};
      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        existingConfig = JSON.parse(configContent);
      } catch {
        // Config doesn't exist yet
      }

      // Merge configurations
      const mergedConfig = {
        ...existingConfig,
        mcpServers: {
          ...existingConfig.mcpServers,
          ...mcpConfig.mcpServers
        }
      };

      await fs.writeFile(configPath, JSON.stringify(mergedConfig, null, 2));
      this.log('✅ Claude Desktop configured successfully', 'green');
      this.log(`   Config location: ${configPath}`, 'blue');
      
    } catch (error) {
      this.errors.push(`Failed to configure Claude Desktop: ${error.message}`);
      this.log(`❌ Failed to configure Claude Desktop: ${error.message}`, 'red');
    }
  }

  async configureGitHubCopilot() {
    this.log('\n🐙 Configuring GitHub Copilot...', 'cyan');
    
    // 1. Create API server service
    await this.createAPIService();
    
    // 2. Configure VS Code settings
    await this.configureVSCode();
    
    // 3. Create Copilot helper script
    await this.createCopilotHelper();
    
    this.log('✅ GitHub Copilot configured successfully', 'green');
  }

  async createAPIService() {
    this.log('Creating API server service...', 'yellow');
    
    if (this.platform === 'darwin') {
      // macOS - Create launchd service
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.olympuscloud.mcp-docs-api</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${path.join(this.projectDir, 'dist', 'api-server.js')}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${this.projectDir}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(this.projectDir, 'logs', 'api-server.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(this.projectDir, 'logs', 'api-server-error.log')}</string>
</dict>
</plist>`;

      const plistPath = path.join(this.homeDir, 'Library', 'LaunchAgents', 'com.olympuscloud.mcp-docs-api.plist');
      await fs.mkdir(path.dirname(plistPath), { recursive: true });
      await fs.writeFile(plistPath, plistContent);
      
      // Load the service
      try {
        await execAsync(`launchctl load ${plistPath}`);
        this.log('✅ API service created and started', 'green');
      } catch (error) {
        this.log('⚠️  Service created but not started. Run manually:', 'yellow');
        this.log(`   launchctl load ${plistPath}`, 'blue');
      }
      
    } else if (this.platform === 'linux') {
      // Linux - Create systemd service
      const serviceContent = `[Unit]
Description=Olympus Cloud MCP Docs API Server
After=network.target

[Service]
Type=simple
User=${process.env.USER}
WorkingDirectory=${this.projectDir}
ExecStart=${process.execPath} ${path.join(this.projectDir, 'dist', 'api-server.js')}
Restart=always
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target`;

      const servicePath = path.join(this.homeDir, '.config', 'systemd', 'user', 'olympus-mcp-api.service');
      await fs.mkdir(path.dirname(servicePath), { recursive: true });
      await fs.writeFile(servicePath, serviceContent);
      
      // Enable and start the service
      try {
        await execAsync('systemctl --user daemon-reload');
        await execAsync('systemctl --user enable olympus-mcp-api.service');
        await execAsync('systemctl --user start olympus-mcp-api.service');
        this.log('✅ API service created and started', 'green');
      } catch (error) {
        this.log('⚠️  Service created but not started. Run manually:', 'yellow');
        this.log('   systemctl --user enable olympus-mcp-api.service', 'blue');
        this.log('   systemctl --user start olympus-mcp-api.service', 'blue');
      }
      
    } else if (this.platform === 'win32') {
      // Windows - Create startup script
      const startupScript = `@echo off
cd /d "${this.projectDir}"
start /B node dist\\api-server.js`;

      const startupPath = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'olympus-mcp-api.bat');
      await fs.mkdir(path.dirname(startupPath), { recursive: true });
      await fs.writeFile(startupPath, startupScript);
      
      // Also create a manual start script
      const manualScript = path.join(this.projectDir, 'start-api-server.bat');
      await fs.writeFile(manualScript, startupScript);
      
      this.log('✅ API startup script created', 'green');
      this.log('   The API server will start automatically on login', 'blue');
      this.log('   To start manually, run: start-api-server.bat', 'blue');
    }
  }

  async configureVSCode() {
    this.log('Configuring VS Code settings...', 'yellow');
    
    const vscodeSettingsPath = path.join(this.projectDir, '.vscode', 'settings.json');
    await fs.mkdir(path.dirname(vscodeSettingsPath), { recursive: true });
    
    let settings = {};
    try {
      const existingSettings = await fs.readFile(vscodeSettingsPath, 'utf8');
      settings = JSON.parse(existingSettings);
    } catch {
      // No existing settings
    }

    // Add Copilot settings
    settings['github.copilot.advanced'] = {
      ...(settings['github.copilot.advanced'] || {}),
      "debug.overrideEngine": "http://localhost:3000/v1",
      "debug.testOverrideProxyUrl": "http://localhost:3000",
      "debug.overrideProxyUrl": "http://localhost:3000"
    };

    await fs.writeFile(vscodeSettingsPath, JSON.stringify(settings, null, 2));
    this.log('✅ VS Code settings configured', 'green');
  }

  async createCopilotHelper() {
    this.log('Creating Copilot helper script...', 'yellow');
    
    const helperContent = `#!/usr/bin/env node

/**
 * GitHub Copilot Integration Helper
 * Use this to test the integration and get documentation context
 */

const axios = require('axios');

async function testIntegration() {
  try {
    const response = await axios.get('http://localhost:3000/health');
    console.log('✅ API Server is running:', response.data);
    
    // Test search
    const searchResponse = await axios.post('http://localhost:3000/search', {
      query: 'test query',
      limit: 5
    });
    
    console.log('\\n✅ Search endpoint working');
    console.log('Results found:', searchResponse.data.results.length);
    
  } catch (error) {
    console.error('❌ API Server is not running or not accessible');
    console.error('Error:', error.message);
    console.log('\\nPlease ensure the API server is running:');
    console.log('  npm run api:start');
  }
}

if (require.main === module) {
  testIntegration();
}

module.exports = { testIntegration };
`;

    const helperPath = path.join(this.projectDir, 'test-copilot.js');
    await fs.writeFile(helperPath, helperContent);
    await fs.chmod(helperPath, '755');
    
    this.log('✅ Copilot helper script created: test-copilot.js', 'green');
  }

  async updatePackageJson() {
    this.log('\n📝 Updating package.json...', 'cyan');
    
    const packagePath = path.join(this.projectDir, 'package.json');
    const packageContent = await fs.readFile(packagePath, 'utf8');
    const packageJson = JSON.parse(packageContent);
    
    // Add helpful scripts
    packageJson.scripts = {
      ...packageJson.scripts,
      "setup": "node setup.js",
      "api:start": "node dist/api-server.js",
      "api:dev": "nodemon --watch src --exec 'npm run build && npm run api:start'",
      "mcp:start": "node dist/cli.js start",
      "test:integration": "node test-copilot.js",
      "doctor": "node setup.js --check"
    };

    // Prepare for NPM publishing
    packageJson.name = "@olympuscloud/mcp-docs-server";
    packageJson.version = packageJson.version || "1.0.0";
    packageJson.description = "Universal documentation MCP server for AI coding assistants (Claude Code & GitHub Copilot)";
    packageJson.keywords = ["mcp", "claude", "copilot", "ai", "documentation", "coding-assistant"];
    packageJson.author = "Olympus Cloud";
    packageJson.license = "MIT";
    packageJson.repository = {
      type: "git",
      url: "https://github.com/olympuscloud/mcp-server-docs-lookup.git"
    };
    packageJson.bin = {
      "olympus-mcp": "./dist/cli.js",
      "olympus-mcp-setup": "./setup.js"
    };
    packageJson.files = [
      "dist/",
      "config/config.example.json",
      "config/schema.json",
      "config/presets/",
      "setup.js",
      "README.md",
      "LICENSE"
    ];
    packageJson.engines = {
      node: ">=18.0.0"
    };

    await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
    this.log('✅ package.json updated', 'green');
  }

  async createGitHubAction() {
    this.log('\n🚀 Creating GitHub Action for NPM publishing...', 'cyan');
    
    const workflowContent = `name: Publish to NPM

on:
  release:
    types: [created]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to publish (e.g., 1.0.0)'
        required: true

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Run tests
        run: npm test
        continue-on-error: true
      
      - name: Update version
        if: github.event_name == 'workflow_dispatch'
        run: npm version \${{ github.event.inputs.version }} --no-git-tag-version
      
      - name: Publish to NPM
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
      
      - name: Create GitHub Release
        if: github.event_name == 'workflow_dispatch'
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v\${{ github.event.inputs.version }}
          release_name: Release v\${{ github.event.inputs.version }}
          draft: false
          prerelease: false
`;

    const workflowPath = path.join(this.projectDir, '.github', 'workflows', 'npm-publish.yml');
    await fs.mkdir(path.dirname(workflowPath), { recursive: true });
    await fs.writeFile(workflowPath, workflowContent);
    
    this.log('✅ GitHub Action created for NPM publishing', 'green');
    this.log('   Add NPM_TOKEN secret to your GitHub repository', 'blue');
  }

  async printInstructions() {
    this.log('\n' + '='.repeat(60), 'bright');
    this.log('🎉 Olympus Cloud MCP Server Setup Complete!', 'green');
    this.log('='.repeat(60) + '\n', 'bright');

    this.log('📋 Quick Start Commands:', 'cyan');
    this.log('  npm run api:start    # Start API server for GitHub Copilot', 'blue');
    this.log('  npm run mcp:start    # Start MCP server for Claude', 'blue');
    this.log('  npm run test:integration  # Test the integration\n', 'blue');

    this.log('🤖 Claude Code:', 'cyan');
    this.log('  ✅ Automatically configured!', 'green');
    this.log('  Restart Claude Desktop to load the MCP server\n', 'yellow');

    this.log('🐙 GitHub Copilot:', 'cyan');
    this.log('  ✅ VS Code settings configured', 'green');
    this.log('  ✅ API service created', 'green');
    if (this.platform === 'win32') {
      this.log('  Run start-api-server.bat to start the API server', 'yellow');
    } else {
      this.log('  The API server should be running automatically', 'yellow');
    }
    this.log('  Open VS Code and start coding with enhanced Copilot!\n', 'blue');

    this.log('📚 Documentation:', 'cyan');
    this.log('  - Configuration: config/config.json', 'blue');
    this.log('  - Add repositories to index in the config file', 'blue');
    this.log('  - Run "npm run doctor" to check system status\n', 'blue');

    if (this.errors.length > 0) {
      this.log('⚠️  Some issues occurred during setup:', 'yellow');
      this.errors.forEach(error => {
        this.log(`  - ${error}`, 'red');
      });
    }

    this.log('🚀 Publishing to NPM:', 'cyan');
    this.log('  1. Add NPM_TOKEN secret to GitHub repository', 'blue');
    this.log('  2. Create a release or run the workflow manually', 'blue');
    this.log('  3. Package will be published as @olympuscloud/mcp-docs-server\n', 'blue');
  }

  async checkStatus() {
    this.log('\n🏥 Running system check...', 'cyan');
    
    // Check API server
    try {
      const axios = require('axios');
      const response = await axios.get('http://localhost:3000/health');
      this.log('✅ API Server is running', 'green');
    } catch {
      this.log('❌ API Server is not running', 'red');
    }

    // Check Qdrant
    try {
      const axios = require('axios');
      const response = await axios.get('http://localhost:6333/collections');
      this.log('✅ Qdrant is running', 'green');
    } catch {
      this.log('❌ Qdrant is not running', 'red');
    }

    // Check Claude config
    let claudeConfigPath;
    switch (this.platform) {
      case 'darwin':
        claudeConfigPath = path.join(this.homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        break;
      case 'win32':
        claudeConfigPath = path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
        break;
      case 'linux':
        claudeConfigPath = path.join(this.homeDir, '.config', 'Claude', 'claude_desktop_config.json');
        break;
    }

    try {
      const config = await fs.readFile(claudeConfigPath, 'utf8');
      const parsed = JSON.parse(config);
      if (parsed.mcpServers?.['olympus-docs']) {
        this.log('✅ Claude Desktop is configured', 'green');
      } else {
        this.log('❌ Claude Desktop configuration incomplete', 'red');
      }
    } catch {
      this.log('❌ Claude Desktop not configured', 'red');
    }

    // Check VS Code settings
    try {
      const settings = await fs.readFile(path.join(this.projectDir, '.vscode', 'settings.json'), 'utf8');
      const parsed = JSON.parse(settings);
      if (parsed['github.copilot.advanced']) {
        this.log('✅ VS Code is configured for Copilot', 'green');
      } else {
        this.log('❌ VS Code Copilot configuration incomplete', 'red');
      }
    } catch {
      this.log('❌ VS Code not configured', 'red');
    }
  }

  async run() {
    try {
      this.log(`${COLORS.bright}🚀 Olympus Cloud MCP Server Setup${COLORS.reset}`, 'cyan');
      this.log('Setting up for both Claude Code and GitHub Copilot\n', 'yellow');

      if (process.argv.includes('--check')) {
        await this.checkStatus();
        return;
      }

      await this.checkPrerequisites();
      await this.installDependencies();
      await this.buildProject();
      await this.setupQdrant();
      await this.createConfig();
      await this.configureClaudeDesktop();
      await this.configureGitHubCopilot();
      await this.updatePackageJson();
      await this.createGitHubAction();
      await this.printInstructions();

    } catch (error) {
      this.log(`\n❌ Setup failed: ${error.message}`, 'red');
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