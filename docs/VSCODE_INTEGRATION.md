# VS Code & GitHub Copilot Integration Guide

## Quick Setup

```bash
# Install globally
npm install -g @olympuscloud/mcp-docs-server

# Configure for VS Code
olympus-mcp integrate github-copilot
```

## Manual Configuration

### 1. Prerequisites

- VS Code with GitHub Copilot installed
- Copilot Language Model API extension (optional but recommended)
- Node.js 18+ installed

### 2. VS Code Settings Configuration

Add to your VS Code `settings.json`:

```json
{
  "github.copilot.chat.models": {
    "olympus-docs": {
      "type": "mcp",
      "config": {
        "command": "node",
        "args": ["${workspaceFolder}/node_modules/@olympuscloud/mcp-docs-server/mcp-launcher.js", "--stdio"],
        "env": {
          "NODE_OPTIONS": "--max-old-space-size=4096 --expose-gc",
          "MCP_MODE": "true"
        }
      }
    }
  }
}
```

### 3. Alternative: Workspace-specific Configuration

For project-specific setup, add to `.vscode/settings.json`:

```json
{
  "github.copilot.chat.models": {
    "project-docs": {
      "type": "mcp",
      "config": {
        "command": "${workspaceFolder}/node_modules/.bin/olympus-mcp",
        "args": ["start", "--stdio"],
        "env": {
          "NODE_OPTIONS": "--max-old-space-size=4096 --expose-gc",
          "MCP_MODE": "true"
        }
      }
    }
  }
}
```

## Usage in GitHub Copilot Chat

Once configured, you can query your documentation directly in Copilot Chat:

### Basic Queries
```
@olympus-docs how do I authenticate with the API?
@olympus-docs show me examples of error handling
@olympus-docs what are the coding standards?
```

### Olympus Cloud Specific
```
@olympus-docs how to implement user auth in Olympus Cloud?
@olympus-docs show Apollo app integration examples
@olympus-docs Olympus hub architecture patterns
```

### Advanced Queries
```
@olympus-docs find React hooks best practices
@olympus-docs search for TypeScript configuration
@olympus-docs show me microservices patterns
```

## Troubleshooting

### Common Issues

1. **"Failed to parse message" errors**
   - The MCP server automatically detects VS Code and disables color output
   - Ensure you're using the latest version

2. **High memory usage**
   - The `NODE_OPTIONS` environment variable includes memory management flags
   - The server automatically manages garbage collection

3. **Server not starting**
   - Check if `olympus-mcp` is in your PATH
   - Try using the full path to the executable
   - Verify Node.js 18+ is installed

### Debug Mode

To enable debug logging, add to the env:

```json
{
  "env": {
    "NODE_OPTIONS": "--max-old-space-size=4096 --expose-gc",
    "MCP_MODE": "true",
    "DEBUG": "mcp:*"
  }
}
```

### Logs Location

Logs are stored in:
- **macOS/Linux**: `~/.mcp-docs/logs/`
- **Windows**: `%USERPROFILE%\.mcp-docs\logs\`

## Performance Optimization

### Memory Settings

Adjust memory allocation based on your documentation size:

- **Small docs (< 100MB)**: `--max-old-space-size=2048`
- **Medium docs (100MB-500MB)**: `--max-old-space-size=4096`
- **Large docs (> 500MB)**: `--max-old-space-size=8192`

### Cache Management

The server automatically manages caches but you can clear them:

```bash
rm -rf ~/.mcp-docs/cache
```

## Advanced Configuration

### Custom Presets

Use specific documentation presets:

```json
{
  "command": "olympus-mcp",
  "args": ["start", "--stdio", "--preset", "olympus-cloud"]
}
```

### Multiple Documentation Sources

Configure multiple MCP servers for different documentation:

```json
{
  "github.copilot.chat.models": {
    "olympus-docs": {
      "type": "mcp",
      "config": {
        "command": "olympus-mcp",
        "args": ["start", "--stdio", "--preset", "olympus-cloud"]
      }
    },
    "azure-docs": {
      "type": "mcp",
      "config": {
        "command": "olympus-mcp",
        "args": ["start", "--stdio", "--preset", "dotnet-azure"]
      }
    }
  }
}
```

## Security Notes

- The MCP server runs locally on your machine
- No data is sent to external servers
- All documentation is indexed and searched locally
- Authentication tokens are stored securely in your system keychain

## Support

For issues or questions:
- GitHub Issues: https://github.com/OlympusCloud/mcp-server-docs-lookup/issues
- Documentation: https://github.com/OlympusCloud/mcp-server-docs-lookup

---

*Compatible with VS Code 1.85+ and GitHub Copilot 1.0+*