# Olympus Cloud MCP Documentation Server 🏛️

A production-ready MCP (Model Context Protocol) server that provides intelligent documentation access for AI coding assistants. Seamlessly integrates with Claude Code and GitHub Copilot to provide context-aware assistance for the entire Olympus Cloud ecosystem or any documentation repository.

## 🚀 One-Command Setup

```bash
# Olympus Cloud Setup (Recommended)
./setup-olympus.sh      # Linux/macOS
.\setup-olympus.ps1    # Windows PowerShell

# Or use the universal Node.js setup
node setup.js           # Auto-detects Olympus context
```

That's it! The setup will:
- ✅ Install and configure everything automatically
- ✅ Set up Claude Desktop integration
- ✅ Configure GitHub Copilot with VS Code
- ✅ Index all Olympus Cloud repositories
- ✅ Create AI-friendly search commands

## What is this?

This MCP server runs locally alongside your AI coding assistant to provide relevant documentation context while you code. For Olympus Cloud developers, it provides complete ecosystem knowledge including all hubs, apps, and documentation.

## Features

### 🏛️ Olympus Cloud Specific
- **Complete Ecosystem Support**: All hubs (Olympus, Nebula, Hermes), apps (Apollo, Athena, Zeus, Hera), and documentation indexed
- **AI-Optimized Commands**: `olympus-ai implement`, `olympus-ai integrate`, `olympus-ai architecture`
- **Smart Context**: Understands Olympus patterns, Azure best practices, and .NET standards
- **Auto-Configuration**: Zero-config setup for Claude Code and GitHub Copilot
- **Preset Configurations**: Olympus production settings ready to use

### 🚀 General Features
- 📚 **Local Documentation Index**: Indexes docs from multiple git repositories on your machine
- 🔍 **Smart Search**: Semantic search with enhanced chunking for better context
- 🤖 **AI Assistant Integration**: Works with Claude Desktop, Cursor, and other MCP tools
- ⚡ **Automatic Sync**: Scheduled repository updates with progress tracking
- 💻 **Low Resource Usage**: Efficient local vector storage with Qdrant
- 🔧 **Easy Setup**: Simple CLI commands with preset configurations
- 🔒 **Security First**: Input validation, path sanitization, PII redaction
- 🚦 **Rate Limiting**: Prevents overload of vector operations
- 🔄 **Resilient**: Comprehensive retry logic with exponential backoff
- 📊 **Production Ready**: Error handling, logging, and monitoring

## Installation

### 🏛️ Olympus Cloud Setup (Recommended)

For Olympus Cloud development with complete ecosystem support:

```bash
# Clone the repository
git clone https://github.com/olympus-cloud/mcp-server-docs-lookup.git
cd mcp-server-docs-lookup

# Run automated setup
./setup-olympus.sh      # Linux/macOS
.\setup-olympus.ps1    # Windows PowerShell
node setup.js          # Cross-platform Node.js
```

### 🎯 AI Assistant Commands (After Setup)

```bash
# Search Olympus documentation
olympus-ai search "implement user authentication"

# Find implementation guides
olympus-ai implement "real-time notifications"

# Integration help
olympus-ai integrate apollo-app

# Architecture patterns
olympus-ai architecture nebula-hub

# Security best practices
olympus-ai security "API endpoints"
```

👉 **See [OLYMPUS_QUICKSTART.md](OLYMPUS_QUICKSTART.md) for complete guide**

### General Setup (Non-Olympus Projects)

```bash
# Clone the repository
git clone https://github.com/olympus-cloud/mcp-server-docs-lookup.git
cd mcp-server-docs-lookup

# Install dependencies
npm install

# Build the project
npm run build

# Start Qdrant vector database
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant

# Initialize with a preset configuration
cp config/presets/general-web.json config/config.json

# Sync documentation repositories
node dist/cli.js sync

# Test the MCP server
node dist/cli.js status
```

### Prerequisites

- **Node.js 18+** - Required for running the MCP server
- **Docker** - Required for Qdrant vector database
- **Git** - Required for cloning documentation repositories
- **8GB+ RAM** - Recommended for processing large documentation sets

👉 **See [QUICKSTART.md](QUICKSTART.md) for detailed manual setup instructions**

## How it Works

1. **Clone & Index**: The server clones documentation repositories to your local machine
2. **Process**: Documents are chunked and converted to vector embeddings
3. **Store**: Embeddings are stored in a local Qdrant instance
4. **Serve**: When your AI assistant needs context, it queries the MCP server
5. **Return**: Relevant documentation chunks are returned to enhance AI responses

## Configuration

Configuration is stored in `config/config.json` in your project directory:

```json
{
  "project": {
    "name": "my-project",
    "description": "Project documentation"
  },
  "repositories": [
    {
      "name": "react-docs",
      "url": "https://github.com/reactjs/react.dev.git",
      "branch": "main",
      "paths": ["/src/content/learn", "/src/content/reference"],
      "category": "framework",
      "priority": "high",
      "syncInterval": 60
    }
  ],
  "contextGeneration": {
    "strategies": ["hybrid"],
    "maxChunks": 20
  },
  "vectorStore": {
    "type": "qdrant",
    "qdrant": {
      "url": "http://localhost:6333",
      "collectionName": "documentation"
    }
  }
}
```

## 📦 NPM Package Installation

Install globally for easy access:

```bash
npm install -g @olympuscloud/mcp-docs-server

# Run setup
olympus-mcp-setup          # Interactive setup
olympus-mcp-setup --olympus # Olympus Cloud setup
olympus-mcp-setup --general # General setup
```

## Available Presets

Quick-start configurations for common development stacks:

- `olympus-cloud` - 🏛️ Complete Olympus Cloud ecosystem (recommended)
- `olympus-production` - 🚀 Olympus Cloud production configuration
- `general-web` - React, Vue, Node.js, TypeScript docs
- `dotnet-azure` - .NET, C#, Azure, Helios Platform documentation  
- `ai-ml` - Python, TensorFlow, PyTorch, Hugging Face docs
- `data-engineering` - Apache Spark, Kafka, Airflow documentation
- `owasp-security` - OWASP security guidelines and best practices
- `nebusai` - NebusAI platform and ML development documentation
- `nebusai-enhanced` - Extended NebusAI with Spark and data engineering

## CLI Commands

### Olympus Cloud Commands

```bash
# AI Assistant Commands
olympus-ai search "implement user authentication"
olympus-ai implement "real-time notifications"
olympus-ai integrate apollo-app
olympus-ai architecture nebula-hub
olympus-ai security "API endpoints"
olympus-ai deploy "hermes-hub production"
olympus-ai test "integration testing"
olympus-ai standards "TypeScript conventions"

# Olympus MCP Commands
olympus-mcp olympus implement "user authentication"
olympus-mcp olympus integrate "apollo-app"
olympus-mcp olympus architecture "nebula-hub"
olympus-mcp olympus list

# Index Olympus repositories
olympus-mcp index --all
```

### General Commands

```bash
# Initialize with preset
olympus-mcp init <preset-name>

# Start the server
olympus-mcp start

# Sync repositories
olympus-mcp sync

# Search from command line
olympus-mcp search "how to use React hooks"

# Check status
olympus-mcp status

# Integration help
olympus-mcp integrate claude-desktop
olympus-mcp integrate github-copilot
```

## Integration with AI Coding Assistants

### Claude Code (Recommended)

Claude Code provides the best integration experience with full MCP support.

**Step 1: Configure the MCP server**
```bash
# In your project directory
cd /path/to/mcp-server-docs-lookup

# Create or update Claude Code MCP configuration
mkdir -p ~/.config/claude-code
cat > ~/.config/claude-code/mcp_servers.json << 'EOF'
{
  "mcpServers": {
    "universal-docs": {
      "command": "node",
      "args": ["/path/to/mcp-server-docs-lookup/dist/server.js", "--stdio"],
      "cwd": "/path/to/mcp-server-docs-lookup",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
EOF
```

**Step 2: Restart Claude Code**
The MCP server will automatically connect and provide documentation tools.

**Step 3: Use in Claude Code**
```
# Example queries:
"Search for React hooks documentation"
"Get context for implementing JWT authentication" 
"Find TypeScript best practices"
```

### Claude Desktop

**Step 1: Update Claude Desktop configuration**
```json
{
  "mcpServers": {
    "universal-docs": {
      "command": "node",
      "args": ["/path/to/mcp-server-docs-lookup/dist/server.js", "--stdio"],
      "cwd": "/path/to/mcp-server-docs-lookup"
    }
  }
}
```

**Configuration file location:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### GitHub Copilot Integration

While GitHub Copilot doesn't directly support MCP, you can use the API mode:

**Step 1: Start API server**
```bash
cd /path/to/mcp-server-docs-lookup
node dist/cli.js start --mode api --port 3001
```

**Step 2: Create VS Code extension or use curl commands**
```bash
# Search documentation
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "React hooks", "maxResults": 10}'

# Get context for coding
curl -X POST http://localhost:3001/api/context \
  -H "Content-Type: application/json" \
  -d '{"task": "implement user authentication", "language": "typescript"}'
```

### Cursor IDE

**Option 1: MCP Integration (if supported)**
```json
{
  "mcp.servers": {
    "universal-docs": {
      "command": "node /path/to/mcp-server-docs-lookup/dist/server.js --stdio"
    }
  }
}
```

**Option 2: API Integration**
Use the API server (port 3001) with custom Cursor extensions or scripts.

### Continue.dev

**Step 1: Configure in Continue config**
```json
{
  "models": [
    {
      "title": "Documentation Enhanced",
      "provider": "openai", 
      "model": "gpt-4",
      "contextProviders": [
        {
          "name": "docs",
          "params": {
            "url": "http://localhost:3001/api/search"
          }
        }
      ]
    }
  ]
}
```

### Codeium Integration

**Step 1: Use API webhooks**
```bash
# Configure Codeium to call documentation API before completions
curl -X POST http://localhost:3001/api/context \
  -H "Content-Type: application/json" \
  -d '{"task": "'"$CURRENT_CONTEXT"'", "language": "'"$FILE_EXTENSION"'"}'
```

### Tabnine Integration

**Step 1: Create Tabnine plugin**
```javascript
// tabnine-docs-plugin.js
const axios = require('axios');

async function getDocumentationContext(query) {
  const response = await axios.post('http://localhost:3001/api/search', {
    query: query,
    maxResults: 5
  });
  return response.data.results;
}

module.exports = { getDocumentationContext };
```

### JetBrains IDEs (IntelliJ, PyCharm, etc.)

**Step 1: Create custom plugin or use HTTP client**
```bash
# Add to IDE's HTTP client or create plugin
### Search Documentation
POST http://localhost:3001/api/search
Content-Type: application/json

{
  "query": "Spring Boot configuration",
  "language": "java",
  "maxResults": 10
}
```

## MCP Tools Available

When integrated with your AI assistant, these tools become available:

### `search_docs`
Search for documentation on a specific topic
```typescript
{
  "tool": "search_docs",
  "query": "React useState hook",
  "category": "framework",  // optional filter
  "limit": 10
}
```

### `get_context`
Get relevant documentation for a coding task
```typescript
{
  "tool": "get_context", 
  "task": "implement authentication with JWT tokens",
  "language": "typescript",
  "framework": "express"
}
```

### `list_repos`
List all indexed repositories
```typescript
{
  "tool": "list_repos"
}
```

## Local Storage

All data is stored locally in your project directory:
- `config/config.json` - Configuration
- `data/repositories/` - Cloned repositories  
- `logs/` - Server logs (with PII protection)
- Qdrant runs on `http://localhost:6333`

## Resource Requirements

- **Disk Space**: ~500MB per documentation repository
- **Memory**: 512MB-1GB depending on index size
- **CPU**: Minimal (indexing happens on startup/sync)

## Privacy & Security

- ✅ **Fully Local**: All processing happens on your machine
- ✅ **No Telemetry**: No data is sent to external servers
- ✅ **Secure Storage**: Local file permissions protect your data
- ✅ **Input Validation**: All inputs sanitized and validated
- ✅ **Path Security**: Directory traversal protection
- ✅ **PII Protection**: Automatic redaction in logs
- ✅ **Rate Limiting**: Prevents abuse and overload
- ✅ **Safe Repository Access**: URL validation, no internal network access

## Troubleshooting

### Server won't start
```bash
# Check if port is in use
lsof -i :6333

# Reset local data
universal-doc-mcp reset

# View logs
universal-doc-mcp logs
```

### Out of memory
```bash
# Reduce chunk size in config
chunkSize: 500  # smaller chunks use less memory

# Limit repositories indexed at once
universal-doc-mcp sync --repo react-docs
```

## Production Features

### Error Handling
- Comprehensive retry logic with exponential backoff
- Circuit breaker pattern for failing services
- Graceful degradation on errors
- Detailed error logging with stack traces

### Security
- Input validation for all MCP requests
- Path traversal protection
- Repository URL validation (no internal networks)
- Sensitive data redaction in logs
- Rate limiting on vector operations

### Performance
- Chunking with context preservation (2000 char chunks, 300 char overlap)
- Batch processing for vector operations
- Connection pooling and timeouts
- Efficient memory usage

### Monitoring
- Structured logging with Winston
- Performance metrics tracking
- Resource usage monitoring
- Health check endpoints

## Documentation

- **[🚀 Olympus Cloud Setup](OLYMPUS_SETUP.md)** - Automated setup for Azure, .NET 9/10, and NebusAI docs
- **[Quick Start Guide](QUICKSTART.md)** - Manual setup in 5 minutes
- **[Claude Code Integration](docs/CLAUDE_CODE_INTEGRATION.md)** - Complete MCP setup for Claude Code
- **[GitHub Copilot Integration](docs/GITHUB_COPILOT_INTEGRATION.md)** - VS Code extensions and API integration
- **[AI Agents Integration](docs/AI_AGENTS_INTEGRATION.md)** - Cursor, Continue.dev, Codeium, Tabnine, and more
- **[Architecture Overview](docs/ARCHITECTURE.md)** - Technical architecture and design decisions

## Development

```bash
# Clone repository
git clone https://github.com/olympus-cloud/mcp-server-docs-lookup.git
cd mcp-server-docs-lookup

# Install dependencies
npm install

# Start Qdrant locally
docker run -p 6333:6333 qdrant/qdrant

# Run in development
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
```

## License

MIT - See LICENSE file