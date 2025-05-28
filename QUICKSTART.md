# Quick Start Guide

Get the Universal Documentation MCP Server running in 5 minutes.

## Prerequisites

- **Node.js 18+** 
- **Docker** (for Qdrant vector database)
- **Git**

## 1. Installation

```bash
# Clone the repository
git clone https://github.com/olympus-cloud/mcp-server-docs-lookup.git
cd mcp-server-docs-lookup

# Install dependencies
npm install

# Build the project
npm run build
```

## 2. Start the Vector Database

```bash
docker run -d -p 6333:6333 --name qdrant qdrant/qdrant
```

## 3. Configure Documentation Sources

Choose a preset or create custom configuration:

```bash
# List available presets
node dist/cli.js list-presets

# Initialize with React/web development docs
cp config/presets/general-web.json config/config.json

# Or initialize with Olympus Cloud docs
cp config/presets/olympus-cloud.json config/config.json

# Or copy example configuration for custom setup
cp config/config.example.json config/config.json
```

## 4. Sync Documentation

```bash
# Sync all configured repositories
node dist/cli.js sync

# Check status
node dist/cli.js status

# This will clone and index all documentation
# First sync may take 5-10 minutes depending on repository sizes
```

## 5. Start Using

### Option A: With Claude Code

Add to your Claude Code MCP settings:

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

Then ask Claude:
- "Search React documentation for useEffect cleanup"
- "Find authentication examples in the Express docs"
- "Show me TypeScript generic constraints"

### Option B: Via API

Start the API server:

```bash
node dist/cli.js start --mode api --port 3001
```

Then search via HTTP:

```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "implement user authentication", "maxResults": 5}'
```

### Option C: Command Line

Search directly from terminal:

```bash
node dist/cli.js search "react hooks"
```

## 6. Add Your Own Documentation

Add a custom repository:

```bash
node dist/cli.js add-repo https://github.com/yourorg/docs.git \
  --name my-docs \
  --priority high
```

Then sync it:

```bash
node dist/cli.js sync my-docs
```

## Common Commands

```bash
# Check status
node dist/cli.js status

# List available presets  
node dist/cli.js list-presets

# Search documentation
node dist/cli.js search "your query"

# Start servers
node dist/cli.js start --stdio           # MCP server for Claude Code
node dist/cli.js start --mode api        # API server for other integrations
```

## Next Steps

- Read the [full documentation](README.md)
- Check out [integration examples](examples/)
- Configure [advanced settings](docs/ARCHITECTURE.md)
- Add more [documentation repositories](config/presets/)

## Troubleshooting

If something doesn't work:

1. **Check Docker is running:**
   ```bash
   docker ps | grep qdrant
   ```

2. **Verify configuration:**
   ```bash
   cat config/config.json
   ```

3. **Check logs:**
   ```bash
   # Look for error messages in the terminal
   ```

4. **Re-sync if needed:**
   ```bash
   node dist/cli.js sync
   ```

Need help? Check the [troubleshooting guide](README.md#troubleshooting) or open an issue.