# Claude Code Integration Guide

This guide provides step-by-step instructions for integrating the Universal Documentation MCP Server with Claude Code for enhanced development workflows.

## Overview

Claude Code provides the best integration experience with full Model Context Protocol (MCP) support, allowing seamless access to documentation during coding sessions.

## Prerequisites

- **Claude Code** - Latest version with MCP support
- **Node.js 18+** - Required for running the MCP server
- **Docker** - Required for Qdrant vector database
- **Git** - For cloning documentation repositories

## Installation & Setup

### Step 1: Install and Build the MCP Server

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

# Verify installation
node dist/cli.js --version
```

### Step 2: Configure Documentation Sources

Choose a preset configuration or create a custom one:

```bash
# Option 1: Use a preset (recommended for quick start)
cp config/presets/general-web.json config/config.json

# Option 2: Use Olympus Cloud preset
cp config/presets/olympus-cloud.json config/config.json

# Option 3: Create custom configuration
cat > config/config.json << 'EOF'
{
  "project": {
    "name": "my-project-docs",
    "description": "Documentation for my development projects"
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
    },
    {
      "name": "typescript-docs",
      "url": "https://github.com/microsoft/TypeScript-Website.git",
      "branch": "v2",
      "paths": ["/packages/documentation/copy"],
      "category": "language",
      "priority": "high"
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
EOF
```

### Step 3: Sync Documentation

```bash
# Sync all configured repositories
node dist/cli.js sync

# Check status
node dist/cli.js status

# Expected output:
# ✅ Sync completed
# 📊 Repository Status
# Total repositories: 2
# Total documents: 1,234
# Total chunks: 5,678
# Indexed vectors: 5,678
```

### Step 4: Configure Claude Code MCP Integration

**Option A: Using Claude Code Settings (Recommended)**

1. Open Claude Code
2. Go to Settings → MCP Servers
3. Add a new MCP server with these settings:
   - **Name**: `universal-docs`
   - **Command**: `node`
   - **Args**: `["/path/to/mcp-server-docs-lookup/dist/server.js", "--stdio"]`
   - **Working Directory**: `/path/to/mcp-server-docs-lookup`
   - **Environment Variables**: 
     ```json
     {
       "NODE_ENV": "production",
       "LOG_LEVEL": "info"
     }
     ```

**Option B: Manual Configuration File**

Create or update the Claude Code MCP configuration:

```bash
# Create Claude Code config directory
mkdir -p ~/.config/claude-code

# Create MCP servers configuration
cat > ~/.config/claude-code/mcp_servers.json << 'EOF'
{
  "mcpServers": {
    "universal-docs": {
      "command": "node",
      "args": ["/FULL/PATH/TO/mcp-server-docs-lookup/dist/server.js", "--stdio"],
      "cwd": "/FULL/PATH/TO/mcp-server-docs-lookup",
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "info"
      }
    }
  }
}
EOF

# Replace /FULL/PATH/TO/ with your actual path
sed -i '' "s|/FULL/PATH/TO/|$(pwd)/|g" ~/.config/claude-code/mcp_servers.json
```

### Step 5: Restart Claude Code

1. Quit Claude Code completely
2. Restart Claude Code
3. Check the MCP connection status in Settings → MCP Servers
4. You should see `universal-docs` as "Connected"

## Using the Documentation Tools

Once integrated, Claude Code will have access to these documentation tools:

### 1. Search Documentation

```
# Example queries to Claude Code:
"Search for React hooks documentation"
"Find examples of JWT authentication in Node.js"
"Show me TypeScript generic constraints"
"Search for Olympus Hub implementation patterns"
```

Claude Code will automatically use the `search_docs` tool to find relevant documentation.

### 2. Get Contextual Help

```
# Example development queries:
"How do I implement user authentication in Express?"
"Get context for building a React component with state management"
"Show me best practices for TypeScript error handling"
"Help me implement an Olympus Cloud service"
```

Claude Code will use the `get_context` tool to provide relevant documentation context.

### 3. Repository Management

```
# Check documentation status:
"List all indexed documentation repositories"
"Check the status of the React documentation"
"Sync the latest documentation updates"
```

## Advanced Configuration

### Adding Private Repositories

For private repositories, add authentication to your config:

```json
{
  "repositories": [
    {
      "name": "private-docs",
      "url": "https://github.com/myorg/private-docs.git",
      "branch": "main",
      "authType": "token",
      "credentials": {
        "token": "ghp_your_github_token_here"
      },
      "priority": "high"
    }
  ]
}
```

### Custom Embedding Models

To use OpenAI embeddings for better accuracy:

```json
{
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "sk-your-openai-key"
  }
}
```

Then set the environment variable:

```bash
export OPENAI_API_KEY=sk-your-openai-key
```

### Performance Optimization

For large documentation sets:

```json
{
  "contextGeneration": {
    "strategies": ["semantic"],
    "maxChunks": 50,
    "chunkSize": 2000,
    "chunkOverlap": 300
  },
  "vectorStore": {
    "qdrant": {
      "url": "http://localhost:6333",
      "collectionName": "docs",
      "vectorSize": 384,
      "distance": "Cosine"
    }
  }
}
```

## Troubleshooting

### MCP Server Not Connecting

1. **Check Claude Code logs:**
   - Open Developer Tools (View → Developer → Developer Tools)
   - Look for MCP connection errors in the console

2. **Verify server starts manually:**
   ```bash
   cd /path/to/mcp-server-docs-lookup
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node dist/server.js --stdio
   ```

3. **Check file paths:**
   - Ensure all paths in the MCP configuration are absolute
   - Verify the `dist/server.js` file exists

### Search Returns No Results

1. **Check if documents are indexed:**
   ```bash
   node dist/cli.js status
   ```

2. **Re-sync repositories:**
   ```bash
   node dist/cli.js sync
   ```

3. **Verify Qdrant is running:**
   ```bash
   curl http://localhost:6333/health
   ```

### Performance Issues

1. **Reduce chunk size:**
   ```json
   {
     "contextGeneration": {
       "maxChunks": 10,
       "chunkSize": 1000
     }
   }
   ```

2. **Limit repository scope:**
   ```json
   {
     "repositories": [
       {
         "paths": ["/docs", "/api"],
         "exclude": ["node_modules", "dist", "build"]
       }
     ]
   }
   ```

## Example Workflows

### React Development

1. **Initialize with React preset:**
   ```bash
   cp config/presets/general-web.json config/config.json
   node dist/cli.js sync
   ```

2. **Ask Claude Code:**
   - "Show me how to use useEffect with cleanup"
   - "Find React Router v6 navigation examples"
   - "Get context for implementing React forms with validation"

### Olympus Cloud Development

1. **Configure Olympus repositories:**
   ```bash
   cp config/presets/olympus-cloud.json config/config.json
   # Update URLs to point to your actual Olympus repositories
   node dist/cli.js sync
   ```

2. **Ask Claude Code:**
   - "Search for Olympus Hub authentication patterns"
   - "Find examples of Olympus service implementation"
   - "Get context for building an Olympus Cloud microservice"

### API Development

1. **Add API documentation repositories:**
   ```json
   {
     "repositories": [
       {
         "name": "openapi-spec",
         "url": "https://github.com/OAI/OpenAPI-Specification.git"
       },
       {
         "name": "rest-api-guidelines",
         "url": "https://github.com/microsoft/api-guidelines.git"
       }
     ]
   }
   ```

2. **Ask Claude Code:**
   - "Show me OpenAPI 3.0 specification examples"
   - "Find REST API best practices"
   - "Get context for implementing API authentication"

## Best Practices

1. **Repository Selection:**
   - Choose high-quality, official documentation repositories
   - Exclude non-documentation files to improve search accuracy
   - Set appropriate priorities for different documentation sources

2. **Query Optimization:**
   - Be specific in your queries to Claude Code
   - Include programming language and framework context
   - Use technical terms and API names for better results

3. **Maintenance:**
   - Regularly update documentation with `node dist/cli.js sync`
   - Monitor vector store size and performance
   - Clean up unused repositories periodically

4. **Security:**
   - Use read-only tokens for repository access
   - Store sensitive credentials in environment variables
   - Regularly rotate access tokens

## Support

For issues and questions:

- Check the troubleshooting section above
- Review logs: `tail -f logs/mcp-server.log`
- Open an issue on GitHub: https://github.com/olympus-cloud/mcp-server-docs-lookup/issues