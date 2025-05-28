# Claude Code Integration Guide

This guide explains how to integrate the Universal Documentation MCP Server with Claude Code.

## Prerequisites

- Node.js 18+ installed
- Docker installed (for Qdrant vector database)
- Claude Code desktop application

## Installation

### Option 1: Global Installation

```bash
npm install -g universal-doc-mcp
```

### Option 2: Local Installation

```bash
git clone https://github.com/your-org/universal-doc-mcp.git
cd universal-doc-mcp
npm install
npm run build
npm link
```

## Configuration

1. Create a configuration directory:

```bash
mkdir ~/claude-docs-config
cd ~/claude-docs-config
```

2. Initialize with a preset:

```bash
universal-doc-mcp init general-web
```

3. Edit the configuration file (`config/config.json`) to add your repositories:

```json
{
  "project": {
    "name": "my-project-docs",
    "description": "Documentation for my projects"
  },
  "repositories": [
    {
      "name": "my-private-docs",
      "url": "https://github.com/myorg/docs.git",
      "branch": "main",
      "authType": "token",
      "credentials": {
        "token": "ghp_xxxxxxxxxxxx"
      },
      "priority": "high"
    }
  ]
}
```

## MCP Server Setup

1. Add the server to Claude Code's MCP settings:

Open Claude Code settings and add:

```json
{
  "mcpServers": {
    "universal-docs": {
      "command": "universal-doc-mcp",
      "args": ["start"],
      "cwd": "/Users/your-username/claude-docs-config"
    }
  }
}
```

2. If using a local installation:

```json
{
  "mcpServers": {
    "universal-docs": {
      "command": "node",
      "args": ["/path/to/universal-doc-mcp/dist/server.js"],
      "cwd": "/Users/your-username/claude-docs-config"
    }
  }
}
```

## Docker Setup

1. Start Qdrant vector database:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

Or use Docker Compose:

```bash
cd ~/claude-docs-config
docker-compose up -d qdrant
```

## Initial Sync

1. Sync all repositories:

```bash
cd ~/claude-docs-config
universal-doc-mcp sync
```

2. Check status:

```bash
universal-doc-mcp status
```

## Using with Claude

Once configured, you can use the documentation search in Claude:

1. **Search documentation:**
   - "Search for authentication implementation in React"
   - "Find examples of TypeScript generics"
   - "Show me how to use Redux Toolkit"

2. **Get specific documentation:**
   - "Get the React hooks documentation"
   - "Show me the Node.js fs module API"

3. **Filter by repository:**
   - "Search for testing patterns in my-private-docs"
   - "Find deployment guides in the DevOps repository"

## Available Tools in Claude

The MCP server provides these tools to Claude:

### search_documentation
Search across all indexed documentation.

Example:
```
Search for "implement user authentication" in TypeScript projects
```

### get_repository_status
Check the status of indexed repositories.

Example:
```
Show me the status of all documentation repositories
```

### sync_repository
Manually trigger a repository sync.

Example:
```
Sync the react-docs repository
```

## Troubleshooting

### MCP Server Not Connecting

1. Check Claude Code logs:
   - View → Developer → Developer Tools → Console

2. Verify the server is running:
   ```bash
   ps aux | grep universal-doc-mcp
   ```

3. Test the server manually:
   ```bash
   echo '{"method":"initialize","id":1}' | universal-doc-mcp start
   ```

### Search Not Working

1. Verify Qdrant is running:
   ```bash
   curl http://localhost:6333/health
   ```

2. Check if documents are indexed:
   ```bash
   universal-doc-mcp status
   ```

3. Re-sync repositories:
   ```bash
   universal-doc-mcp sync
   ```

### Authentication Issues

1. For private repositories, ensure your token has read access:
   ```bash
   curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user/repos
   ```

2. Update credentials in config:
   ```bash
   # Edit config/config.json and update the credentials section
   ```

## Advanced Configuration

### Custom Embedding Models

To use OpenAI embeddings instead of local models:

1. Set environment variable:
   ```bash
   export OPENAI_API_KEY=sk-...
   ```

2. Update server configuration in MCP settings:
   ```json
   {
     "mcpServers": {
       "universal-docs": {
         "command": "universal-doc-mcp",
         "args": ["start"],
         "cwd": "/Users/your-username/claude-docs-config",
         "env": {
           "EMBEDDING_PROVIDER": "openai",
           "OPENAI_API_KEY": "sk-..."
         }
       }
     }
   }
   ```

### Scheduled Syncs

Configure automatic repository updates in `config.json`:

```json
{
  "repositories": [
    {
      "name": "react-docs",
      "syncInterval": 60  // Sync every 60 minutes
    }
  ]
}
```

### Performance Tuning

For large documentation sets:

1. Increase Node.js memory:
   ```json
   {
     "mcpServers": {
       "universal-docs": {
         "command": "node",
         "args": ["--max-old-space-size=4096", "dist/server.js"]
       }
     }
   }
   ```

2. Configure chunking strategy in config:
   ```json
   {
     "contextGeneration": {
       "maxChunks": 50,  // Increase for more context
       "strategies": ["semantic"]  // Use only semantic search
     }
   }
   ```

## Best Practices

1. **Repository Organization:**
   - Group related documentation in categories
   - Set appropriate priorities for repositories
   - Exclude unnecessary files (images, videos, etc.)

2. **Search Queries:**
   - Be specific about what you're looking for
   - Include language/framework context
   - Use technical terms and API names

3. **Performance:**
   - Limit sync intervals for large repositories
   - Use exclude patterns to skip non-documentation files
   - Regular cleanup of unused repositories

4. **Security:**
   - Store tokens in environment variables
   - Use read-only tokens for repositories
   - Regularly rotate access tokens