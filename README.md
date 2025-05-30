# MCP Documentation Server 📚

A production-ready MCP (Model Context Protocol) server that provides intelligent documentation access for AI coding assistants. Seamlessly integrates with Claude and GitHub Copilot to provide context-aware assistance.

## 📋 Features

- **Local Documentation Index**: Indexes docs from multiple git repositories
- **Semantic Search**: Finds relevant context based on meaning, not just keywords
- **AI Assistant Integration**: Works with Claude, GitHub Copilot, and other MCP-compatible tools
- **Automatic Repository Sync**: Keeps documentation up-to-date
- **Vector-based Search**: Fast and accurate retrieval using Qdrant
- **Low Resource Usage**: Efficient local processing with minimal overhead
- **Secure**: Input validation, path sanitization, authentication options
- **Production Ready**: Robust error handling, logging, and monitoring

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/username/mcp-server-docs-lookup.git
cd mcp-server-docs-lookup

# Install dependencies
npm install

# Build the project
npm run build

# Configure repositories (edit config/config.json)
cp config/config.example.json config/config.json

# Start the server
npm run api
```

The server will be running at http://localhost:3001. Access the health endpoint:

```bash
curl http://localhost:3001/health
```

## Documentation

- [INTEGRATION.md](./INTEGRATION.md) - How to integrate with AI assistants
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architecture overview
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues and solutions 
- [OLYMPUS_CLOUD.md](./OLYMPUS_CLOUD.md) - Olympus Cloud specific information
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines

## Prerequisites

- **Node.js 18+** - Required for running the MCP server
- **Docker** - Required for Qdrant vector database
- **Git** - Required for cloning documentation repositories
- **8GB+ RAM** - Recommended for processing large documentation sets

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

## Integration with AI Coding Assistants

For complete integration instructions with different AI assistants, refer to [INTEGRATION.md](./INTEGRATION.md).

### Quick Integration Commands

```bash
# For Claude integration
npm run integrate:claude

# For GitHub Copilot integration
npm run integrate:copilot

# For VS Code integration
npm run integrate:vscode
```

## Troubleshooting

For common issues and solutions, refer to [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

Common troubleshooting commands:

```bash
# Test connection
npm run tools:search

# Fix embedding issues
npm run tools:fix-embeddings
```

## Development

```bash
# Clone repository
git clone https://github.com/username/mcp-server-docs-lookup.git
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
```

## License

MIT - See LICENSE file
