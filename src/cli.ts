#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { ConfigLoader } from './utils/config-loader';
import { GitSyncService } from './services/git-sync';
import { VectorStore } from './services/vector-store';
import { EmbeddingService, EmbeddingProvider } from './services/embedding';
import { ContextGenerator } from './services/context-generator';
import { DocumentProcessor } from './services/document-processor';
import { UnifiedServer, ServerMode, UnifiedServerConfig } from './unified-server';
// import logger from './utils/logger';

const program = new Command();

// Check if running in Olympus mode
const isOlympusMode = process.env.OLYMPUS_MODE === 'true' || process.argv.includes('--olympus');

program
  .name(isOlympusMode ? 'olympus-mcp' : 'universal-doc-mcp')
  .description(isOlympusMode ? 'Olympus Cloud MCP server for AI coding assistants' : 'Universal documentation MCP server for AI coding assistants')
  .version('1.0.0');

program
  .command('init [preset]')
  .description('Initialize configuration with optional preset')
  .option('-l, --list', 'List available presets')
  .action(async (preset?: string, _options?: { list?: boolean }) => {
    try {
      if (_options?.list) {
        console.log('📋 Available presets:\n');
        
        const presets = [
          { name: 'olympus-cloud', description: '🏛️  Complete Olympus Cloud ecosystem (recommended)' },
          { name: 'olympus-production', description: '🚀 Olympus Cloud production configuration' },
          { name: 'dotnet-azure', description: '.NET and Azure development documentation' },
          { name: 'helios-platform', description: 'Helios Platform internal documentation (requires auth)' },
          { name: 'spark-app', description: 'Apache Spark and big data analytics documentation' },
          { name: 'nebusai', description: 'NebusAI platform and ML development documentation' },
          { name: 'general-web', description: 'General web development (React, Node.js, TypeScript)' },
          { name: 'ai-ml', description: 'AI/ML frameworks and libraries' }
        ];
        
        presets.forEach(p => {
          console.log(`  🔧 ${p.name.padEnd(20)} - ${p.description}`);
        });
        
        console.log('\nUsage: universal-doc-mcp init <preset-name>');
        return;
      }

      const configPath = path.join(process.cwd(), 'config');
      await fs.mkdir(configPath, { recursive: true });

      // const configLoader = new ConfigLoader();
      
      if (preset) {
        // Try to load preset from multiple locations
        const presetLocations = [
          path.join(__dirname, '..', 'config', 'presets', `${preset}.json`),
          path.join(process.cwd(), 'config', 'presets', `${preset}.json`),
          path.join(__dirname, '..', '..', 'config', 'presets', `${preset}.json`)
        ];
        
        let presetConfig = null;
        let usedLocation = '';
        
        for (const location of presetLocations) {
          try {
            const presetContent = await fs.readFile(location, 'utf-8');
            presetConfig = JSON.parse(presetContent);
            usedLocation = location;
            break;
          } catch (error) {
            // Continue to next location
          }
        }
        
        if (!presetConfig) {
          console.error(`❌ Preset '${preset}' not found. Use --list to see available presets.`);
          process.exit(1);
        }

        // Use the full preset configuration
        await fs.writeFile(
          path.join(configPath, 'config.json'),
          JSON.stringify(presetConfig, null, 2)
        );

        console.log(`✅ Configuration initialized with preset: ${preset}`);
        console.log(`📄 Using preset from: ${usedLocation}`);
        console.log(`📊 Configured ${presetConfig.repositories.length} repositories`);
        
        // Show repository summary
        console.log('\n📚 Repositories configured:');
        presetConfig.repositories.forEach((repo: any, index: number) => {
          console.log(`  ${index + 1}. ${repo.name} (${repo.url})`);
        });
        
      } else {
        const defaultConfig = {
          project: {
            name: 'my-project',
            description: 'Project documentation'
          },
          repositories: [],
          contextGeneration: {
            strategies: ['hybrid'],
            maxChunks: 20,
            priorityWeighting: {
              high: 1.5,
              medium: 1.0,
              low: 0.5
            }
          },
          server: {
            port: 3000,
            host: 'localhost',
            cors: {
              enabled: true,
              origins: ['http://localhost:*']
            }
          },
          vectorStore: {
            type: 'qdrant' as const,
            qdrant: {
              url: 'http://localhost:6333',
              collectionName: 'documentation'
            }
          }
        };

        await fs.writeFile(
          path.join(configPath, 'config.json'),
          JSON.stringify(defaultConfig, null, 2)
        );

        console.log('✅ Configuration initialized with empty template');
      }

      console.log('\n🚀 Next steps:');
      if (!preset) {
        console.log('1. Edit config/config.json to add your repositories');
        console.log('2. Or re-run with a preset: universal-doc-mcp init --list');
      }
      console.log('2. Run "universal-doc-mcp start" to start the server');
    } catch (error) {
      console.error('❌ Failed to initialize configuration:', error);
      process.exit(1);
    }
  });

program
  .command('list-presets')
  .description('List available presets')
  .action(async () => {
    try {
      const configLoader = new ConfigLoader();
      const presets = await configLoader.listPresets();
      
      console.log('Available presets:');
      presets.forEach(preset => {
        console.log(`  - ${preset}`);
      });
    } catch (error) {
      console.error('❌ Failed to list presets:', error);
      process.exit(1);
    }
  });

program
  .command('add-repo <url>')
  .description('Add a repository to the configuration')
  .option('-n, --name <name>', 'Repository name')
  .option('-b, --branch <branch>', 'Branch to track', 'main')
  .option('-p, --priority <priority>', 'Priority (high, medium, low)', 'medium')
  .option('-c, --category <category>', 'Repository category')
  .option('-i, --interval <interval>', 'Sync interval in minutes', '60')
  .action(async (url: string, options: any) => {
    try {
      const configLoader = new ConfigLoader();
      await configLoader.loadConfig();

      const name = options.name || path.basename(url, '.git');
      
      configLoader.addRepository({
        name,
        url,
        branch: options.branch,
        authType: 'none',
        paths: ['/'],
        exclude: ['node_modules', '.git', 'dist', 'build'],
        syncInterval: parseInt(options.interval),
        priority: options.priority,
        category: options.category,
        metadata: {}
      });

      await configLoader.saveConfig();
      console.log(`✅ Repository ${name} added successfully`);
    } catch (error) {
      console.error('❌ Failed to add repository:', error);
      process.exit(1);
    }
  });

program
  .command('sync [repository]')
  .description('Sync repositories')
  .action(async (repository?: string) => {
    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.loadConfig();
      const gitSync = new GitSyncService();
      const documentProcessor = new DocumentProcessor();
      const vectorStore = new VectorStore(config.vectorStore!);
      const embeddingService = new EmbeddingService({
        provider: EmbeddingProvider.LOCAL
      });

      await vectorStore.initialize();

      const setupHandlers = () => {
        gitSync.on('sync:start', (repo) => {
          console.log(`🔄 Syncing ${repo.name}...`);
        });

        gitSync.on('sync:complete', (repo, changes) => {
          console.log(`✅ ${repo.name}: ${changes.length} files changed`);
        });

        gitSync.on('sync:error', (repo, error) => {
          console.error(`❌ ${repo.name}: ${error.message}`);
        });

        gitSync.on('file:changed', async (repo, filepath) => {
          try {
            // Skip directories and non-text files
            if (filepath.includes('/') && filepath.endsWith('/')) {
              return; // Skip directories
            }
            
            // Skip binary and unwanted file types
            const skipExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
            if (skipExtensions.some(ext => filepath.toLowerCase().endsWith(ext))) {
              return;
            }
            
            const content = await gitSync.getFileContent(repo, filepath);
            const result = await documentProcessor.processDocument(filepath, content, repo);
            
            if (result.chunks.length > 0) {
              const chunksWithEmbeddings = await embeddingService.generateChunkEmbeddings(result.chunks);
              await vectorStore.upsertChunks(chunksWithEmbeddings);
            }
          } catch (error) {
            // Only log directory errors at debug level
            if (error instanceof Error && error.message.includes('directory')) {
              console.log(`⚠️  Skipped directory: ${filepath}`);
            } else {
              console.error(`❌ Failed to process ${filepath}:`, error);
            }
          }
        });
      };

      setupHandlers();

      // Track completion of all repositories
      let completedRepos = 0;
      let totalRepos = 0;
      const reposToProcess = repository ? [repository] : config.repositories.map(r => r.name);
      totalRepos = reposToProcess.length;

      const checkCompletion = () => {
        completedRepos++;
        if (completedRepos >= totalRepos) {
          console.log('\n✅ Sync completed');
          setTimeout(() => process.exit(0), 1000); // Allow time for final operations
        }
      };

      gitSync.on('sync:complete', (repo, changes) => {
        console.log(`✅ ${repo.name}: ${changes.length} files processed`);
        checkCompletion();
      });

      gitSync.on('sync:error', (repo, error) => {
        console.error(`❌ ${repo.name}: ${error.message}`);
        checkCompletion(); // Still count as completed to avoid hanging
      });

      if (repository) {
        const repo = config.repositories.find(r => r.name === repository);
        if (!repo) {
          console.error(`❌ Repository not found: ${repository}`);
          process.exit(1);
        }
        await gitSync.syncRepository(repo);
      } else {
        await gitSync.syncAll(config.repositories);
      }
    } catch (error) {
      console.error('❌ Sync failed:', error);
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Search documentation')
  .option('-l, --limit <limit>', 'Maximum results', '10')
  .option('-r, --repository <repo>', 'Filter by repository')
  .option('-c, --category <category>', 'Filter by category')
  .action(async (query: string, _options: any) => {
    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.loadConfig();
      const vectorStore = new VectorStore(config.vectorStore!);
      const embeddingService = new EmbeddingService({
        provider: EmbeddingProvider.LOCAL
      });
      const contextGenerator = new ContextGenerator(
        vectorStore,
        embeddingService,
        config.contextGeneration
      );

      await vectorStore.initialize();

      const result = await contextGenerator.generateContext({
        task: query,
        maxResults: parseInt(_options.limit),
        repositories: _options.repository ? [_options.repository] : undefined,
        categories: _options.category ? [_options.category] : undefined
      });

      console.log(`\n🔍 Search results for: "${query}"`);
      console.log(`Strategy: ${result.strategy}`);
      console.log(`Total results: ${result.metadata.totalResults}`);
      console.log(`Search time: ${result.metadata.searchTime}ms\n`);

      result.results.forEach((chunk, index) => {
        console.log(`${index + 1}. ${chunk.repository} - ${chunk.filepath}`);
        console.log(`   Score: ${chunk.score.toFixed(3)}`);
        console.log(`   Type: ${chunk.type}`);
        if (chunk.metadata.title) {
          console.log(`   Title: ${chunk.metadata.title}`);
        }
        console.log(`   Content: ${chunk.content.substring(0, 200)}...`);
        console.log();
      });
      
      // Ensure the process exits after search
      process.exit(0);
    } catch (error) {
      console.error('❌ Search failed:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show repository status')
  .action(async () => {
    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.loadConfig();
      const vectorStore = new VectorStore(config.vectorStore!);
      
      await vectorStore.initialize();
      const stats = await vectorStore.getStats();

      console.log('\n📊 Repository Status\n');
      console.log(`Project: ${config.project.name}`);
      console.log(`Total repositories: ${config.repositories.length}`);
      console.log(`Total documents: ${stats.totalDocuments}`);
      console.log(`Total chunks: ${stats.totalChunks}`);
      console.log(`Indexed vectors: ${stats.collectionSize}\n`);

      console.log('Repositories:');
      config.repositories.forEach(repo => {
        console.log(`  - ${repo.name}`);
        console.log(`    URL: ${repo.url}`);
        console.log(`    Branch: ${repo.branch}`);
        console.log(`    Priority: ${repo.priority}`);
        console.log(`    Sync interval: ${repo.syncInterval} minutes`);
      });
      
      // Ensure the process exits after displaying status
      process.exit(0);
    } catch (error) {
      console.error('❌ Failed to get status:', error);
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start the unified server')
  .option('-s, --stdio', 'Run in stdio mode for MCP protocol', false)
  .option('-m, --mode <mode>', 'Server mode (mcp, api, enhanced, websocket)', 'mcp')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('--enable-websocket', 'Enable WebSocket support', false)
  .option('--enable-metrics', 'Enable metrics endpoint', false)
  .option('--max-memory <mb>', 'Maximum memory usage in MB', '2048')
  .action(async (options: any) => {
    try {
      const serverConfig: UnifiedServerConfig = {
        mode: options.mode as ServerMode,
        port: parseInt(options.port),
        enableWebSocket: options.enableWebsocket,
        enableMetrics: options.enableMetrics,
        maxMemory: parseInt(options.maxMemory),
        debug: process.env.NODE_ENV === 'development'
      };

      console.log(`🚀 Starting unified server in ${serverConfig.mode} mode...`);
      
      const server = new UnifiedServer(serverConfig);
      
      process.on('SIGINT', async () => {
        console.log('\n📡 Received SIGINT, shutting down gracefully...');
        await server.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n📡 Received SIGTERM, shutting down gracefully...');
        await server.stop();
        process.exit(0);
      });

      await server.start();
      
      if (serverConfig.mode === 'api' || serverConfig.mode === 'websocket') {
        console.log(`✅ Server running on port ${serverConfig.port}`);
      } else {
        console.log('✅ MCP server ready for connections');
      }
      
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  });

// Olympus-specific commands
if (isOlympusMode) {
  program
    .command('olympus <action> [target]')
    .description('Olympus Cloud specific commands')
    .option('-t, --type <type>', 'Filter by type (hub, app, docs)')
    .action(async (action: string, target?: string, _options?: any) => {
      try {
        const configLoader = new ConfigLoader();
        const config = await configLoader.loadConfig();
        const vectorStore = new VectorStore(config.vectorStore!);
        const embeddingService = new EmbeddingService({
          provider: EmbeddingProvider.LOCAL
        });
        const contextGenerator = new ContextGenerator(
          vectorStore,
          embeddingService,
          config.contextGeneration
        );

        await vectorStore.initialize();

        switch (action) {
          case 'implement': {
            const implementQuery = `implement ${target} in Olympus Cloud best practices examples code patterns`;
            const implementResult = await contextGenerator.generateContext({
              task: implementQuery,
              maxResults: 20
            });
            console.log(`\n🛠️  Implementation guide for: ${target}\n`);
            implementResult.results.forEach((chunk, i) => {
              console.log(`${i + 1}. ${chunk.repository}:${chunk.filepath}`);
              console.log(`   ${chunk.content.substring(0, 300)}...\n`);
            });
            break;
          }

          case 'integrate': {
            const integrateQuery = `${target} integration API endpoints authentication examples Olympus`;
            const integrateResult = await contextGenerator.generateContext({
              task: integrateQuery,
              maxResults: 15
            });
            console.log(`\n🔗 Integration guide for: ${target}\n`);
            integrateResult.results.forEach((chunk, i) => {
              console.log(`${i + 1}. ${chunk.repository}:${chunk.filepath}`);
              console.log(`   ${chunk.content.substring(0, 300)}...\n`);
            });
            break;
          }

          case 'architecture': {
            const archQuery = `${target || 'Olympus Cloud'} architecture patterns microservices hub app design`;
            const archResult = await contextGenerator.generateContext({
              task: archQuery,
              maxResults: 15
            });
            console.log(`\n🏗️  Architecture guide for: ${target || 'Olympus Cloud'}\n`);
            archResult.results.forEach((chunk, i) => {
              console.log(`${i + 1}. ${chunk.repository}:${chunk.filepath}`);
              console.log(`   ${chunk.content.substring(0, 300)}...\n`);
            });
            break;
          }

          case 'list': {
            console.log('\n📚 Olympus Cloud Components:\n');
            console.log('🏛️  Platform:');
            console.log('  - olympus-cloud: Main platform');
            console.log('\n🎯 Hubs:');
            console.log('  - olympus-hub: Central orchestration');
            console.log('  - nebula-hub: Data processing');
            console.log('  - hermes-hub: Communication');
            console.log('\n📱 Apps:');
            console.log('  - apollo-app: API management');
            console.log('  - athena-app: Knowledge & AI');
            console.log('  - zeus-app: Infrastructure');
            console.log('  - hera-app: User management');
            console.log('\n📖 Documentation:');
            console.log('  - olympus-docs: Complete docs');
            console.log('  - olympus-standards: Best practices');
            break;
          }

          default:
            console.log('❌ Unknown action:', action);
            console.log('Available actions: implement, integrate, architecture, list');
        }
        
        process.exit(0);
      } catch (error) {
        console.error('❌ Command failed:', error);
        process.exit(1);
      }
    });

  program
    .command('index')
    .description('Index Olympus Cloud repositories')
    .option('--all', 'Index all Olympus repositories')
    .option('--type <type>', 'Index by type (hub, app, docs)')
    .action(async (_options: any) => {
      try {
        console.log('🚀 Starting Olympus Cloud indexing...\n');
        
        // Trigger sync command with all repos
        const syncProcess = spawn(process.execPath, [__filename, 'sync'], {
          stdio: 'inherit'
        });

        syncProcess.on('close', (code) => {
          if (code === 0) {
            console.log('\n✅ Olympus Cloud fully indexed!');
            console.log('Use "olympus-ai search <query>" to search');
          } else {
            console.error('\n❌ Indexing failed');
          }
          process.exit(code || 0);
        });
      } catch (error) {
        console.error('❌ Index command failed:', error);
        process.exit(1);
      }
    });
}

program
  .command('integrate <platform>')
  .description('Show integration instructions')
  .action((platform: string) => {
    switch (platform.toLowerCase()) {
      case 'claude':
      case 'claude-code':
      case 'claude-desktop':
        console.log('\n📋 Claude Desktop Integration\n');
        console.log('Your Claude Desktop is already configured with:');
        console.log(`
{
  "mcpServers": {
    "olympus-mcp": {
      "command": "olympus-mcp",
      "args": ["start", "--stdio"],
      "env": {
        "NODE_OPTIONS": "--max-old-space-size=4096 --expose-gc",
        "OLYMPUS_MODE": "true",
        "MCP_MODE": "true"
      }
    }
  }
}

✅ Status: Ready to use! Just restart Claude Desktop.
        `);
        break;

      case 'cursor':
        console.log('\n📋 Cursor Integration\n');
        console.log('Add to your Cursor MCP settings:');
        console.log(`
{
  "mcpServers": {
    "universal-docs": {
      "command": "npx",
      "args": ["universal-doc-mcp", "start", "--stdio"]
    }
  }
}

Or if installed globally:

{
  "mcpServers": {
    "universal-docs": {
      "command": "universal-doc-mcp",
      "args": ["start", "--stdio"]
    }
  }
}
        `);
        break;

      case 'github-copilot':
      case 'copilot':
      case 'vscode':
      case 'vs-code':
        console.log('\n📋 GitHub Copilot (VS Code) Integration\n');
        console.log('✅ Package already installed globally at: /opt/homebrew/bin/olympus-mcp\n');
        
        console.log('VS Code Setup:');
        console.log('1. Install the Copilot Language Model API extension in VS Code');
        console.log('2. Open VS Code settings.json (Cmd+Shift+P > "Preferences: Open Settings (JSON)")');
        console.log('3. Add this configuration:\n');
        console.log(`{
  "github.copilot.chat.models": {
    "olympus-mcp": {
      "type": "mcp",
      "config": {
        "command": "olympus-mcp",
        "args": ["start", "--stdio"],
        "env": {
          "NODE_OPTIONS": "--max-old-space-size=4096 --expose-gc",
          "OLYMPUS_MODE": "true",
          "MCP_MODE": "true",
          "LOG_LEVEL": "info"
        }
      }
    }
  }
}

Alternative configurations:

// If installed locally in your project:
{
  "github.copilot.chat.models": {
    "olympus-docs": {
      "type": "mcp",
      "config": {
        "command": "node",
        "args": [
          "\${workspaceFolder}/node_modules/@olympuscloud/mcp-docs-server/mcp-launcher.js",
          "start",
          "--stdio"
        ]
      }
    }
  }
}

// For development (running from source):
{
  "github.copilot.chat.models": {
    "olympus-docs": {
      "type": "mcp",
      "config": {
        "command": "node",
        "args": [
          "\${workspaceFolder}/dist/server.js",
          "--stdio"
        ],
        "cwd": "\${workspaceFolder}"
      }
    }
  }
}
        `);
        console.log('\n4. Restart VS Code');
        console.log('5. In Copilot Chat, you can now use @olympus-docs to query your documentation\n');
        console.log('Troubleshooting:');
        console.log('- If you get "executable not found", ensure the package is installed globally');
        console.log('- Check logs: View > Output > GitHub Copilot Chat');
        console.log('- Verify Node.js is in PATH: node --version\n');
        console.log('Example queries:');
        console.log('  @olympus-docs how do I authenticate with the API?');
        console.log('  @olympus-docs show me examples of using React hooks');
        console.log('  @olympus-docs what are the Olympus Cloud best practices?');
        break;

      default:
        console.log(`❌ Unknown platform: ${platform}`);
        console.log('Supported platforms: claude-desktop, claude-code, cursor, github-copilot, vscode');
    }
  });

program.parse();