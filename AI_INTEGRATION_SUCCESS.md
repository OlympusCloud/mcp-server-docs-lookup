# AI Integration Success Guide

## MCP Server for Claude Code, Claude Desktop, and GitHub Copilot

### Package Successfully Published

The `@olympuscloud/mcp-docs-server` package has been successfully published to GitHub Packages and is now ready for integration with all major AI coding assistants.

**Package Details:**

- **Name**: `@olympuscloud/mcp-docs-server`
- **Version**: `1.1.1`
- **Registry**: <https://npm.pkg.github.com/>
- **Repository**: <https://github.com/OlympusCloud/mcp-server-docs-lookup>

---

## 🚀 Quick Setup Instructions

### Prerequisites
1. **Node.js** (v18 or higher)
2. **npm** or **yarn**
3. **GitHub authentication** for private packages
4. **VS Code Insiders** (for Claude Code integration)

### 1. GitHub Authentication Setup

First, configure npm to access GitHub Packages:

```bash
# Add GitHub registry configuration
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
echo "@olympuscloud:registry=https://npm.pkg.github.com/" >> ~/.npmrc
```

Replace `YOUR_GITHUB_TOKEN` with a GitHub Personal Access Token that has `read:packages` scope.

### 2. Install the MCP Server

```bash
# Install globally for easy access
npm install -g @olympuscloud/mcp-docs-server@latest --registry https://npm.pkg.github.com/

# Verify installation
olympus-mcp --help
```

### 3. Quick Start with Presets

```bash
# Initialize with Olympus Cloud preset
olympus-mcp init --preset olympus-cloud

# Start the API server for GitHub Copilot
olympus-mcp --config config/api-config.json

# In another terminal, start the MCP server for Claude
olympus-mcp --config config/config.json
```

---

## 🔧 Integration with AI Assistants

### A. Claude Desktop Integration

1. **Start the MCP Server**:
   ```bash
   olympus-mcp --config config/config.json --mode stdio
   ```

2. **Configure Claude Desktop**:
   - Open Claude Desktop
   - Go to Settings → Advanced
   - Add MCP Server:
     - **Name**: "Olympus Docs Server"
     - **Command**: `olympus-mcp`
     - **Args**: `["--config", "/path/to/config/config.json", "--mode", "stdio"]`

### B. VS Code with Claude Code Extension

1. **Start the API Server**:
   ```bash
   olympus-mcp --config config/api-config.json
   ```

2. **Configure VS Code Insiders**:
   Add to your `settings.json`:
   ```json
   {
     "claude.modelContext.server": "http://localhost:3000",
     "claude.modelContext.enabled": true
   }
   ```

3. **Install Claude Extension**:
   - Open VS Code Insiders
   - Install the "Claude AI" extension
   - Restart VS Code

### C. GitHub Copilot Integration

1. **Ensure API Server is Running**:
   ```bash
   olympus-mcp --config config/api-config.json
   ```

2. **Configure GitHub Copilot**:
   Add to your VS Code `settings.json`:
   ```json
   {
     "github.copilot.advanced": {
       "serverEndpoint": "http://localhost:3000"
     },
     "github.copilot.enable": {
       "*": true,
       "plaintext": false,
       "markdown": true
     }
   }
   ```

---

## 📁 Configuration Files

### Main Configuration (`config/config.json`)
- **Purpose**: Primary MCP server configuration
- **Mode**: STDIO for Claude Desktop
- **Features**: Full document processing, vector search, embeddings

### API Configuration (`config/api-config.json`)
- **Purpose**: REST API server for web-based integrations
- **Mode**: HTTP server on port 3000
- **Features**: RESTful endpoints for GitHub Copilot and Claude Code

---

## 🧪 Testing the Integration

### Test MCP Server
```bash
# Test MCP server help
olympus-mcp --help

# Test with specific config
olympus-mcp --config config/config.json --test
```

### Test API Server
```bash
# Health check
curl http://localhost:3000/health

# Search documentation
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Azure Functions", "maxResults": 5}'

# Get context
curl -X POST http://localhost:3000/api/context \
  -H "Content-Type: application/json" \
  -d '{"task": "Create Azure Function", "language": "csharp"}'
```

---

## 🔍 Available Tools and Capabilities

### MCP Tools (for Claude Desktop)
- `search_docs`: Search documentation with semantic similarity
- `get_context`: Get relevant context for coding tasks
- `generate_code`: Generate code based on documentation patterns
- `validate_code`: Validate code against best practices
- `olympus_search`: Search Olympus Cloud specific documentation

### API Endpoints (for GitHub Copilot & Claude Code)
- `POST /api/search`: Document search
- `POST /api/context`: Context generation
- `POST /api/generate`: Code generation
- `POST /api/validate`: Code validation
- `GET /health`: Health check

---

## 📊 Supported Documentation Sources

### Default Repositories
- **Olympus Cloud**: Internal documentation and patterns
- **.NET Core/5+**: Official Microsoft .NET documentation
- **ASP.NET Core**: Web framework documentation
- **Azure**: Cloud services and architecture guides
- **Blazor**: UI framework documentation
- **Azure Functions**: Serverless compute documentation

### Custom Repository Support
Add your own documentation sources by editing the `repositories` section in `config.json`.

---

## 🎯 Use Cases

### For Claude Desktop Users
- Get instant access to Olympus Cloud documentation
- Generate code following company patterns
- Validate code against best practices
- Search across multiple documentation sources

### For VS Code Users (Claude Code + GitHub Copilot)
- Real-time documentation lookup while coding
- Context-aware code suggestions
- Integrated search within the editor
- Seamless workflow with existing extensions

---

## 🛠️ Troubleshooting

### Common Issues

1. **Package Installation Failed**
   ```bash
   # Check GitHub authentication
   npm whoami --registry https://npm.pkg.github.com/
   
   # Verify token permissions
   curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user
   ```

2. **Server Won't Start**
   ```bash
   # Check port availability
   lsof -i :3000
   
   # Try different port
   olympus-mcp --config config/api-config.json --port 3001
   ```

3. **Claude Desktop Connection Issues**
   - Verify the server is running in STDIO mode
   - Check the command path in Claude Desktop settings
   - Restart Claude Desktop after configuration changes

4. **VS Code Integration Issues**
   - Ensure VS Code Insiders is being used
   - Verify the Claude AI extension is installed and enabled
   - Check the settings.json configuration

---

## 📈 Performance Tips

### For Large Documentation Sets
- Use selective repository syncing
- Configure appropriate `syncInterval`
- Monitor vector store performance
- Consider using external Qdrant instance

### For Development Workflows
- Use development mode for faster iteration
- Enable verbose logging for debugging
- Use health checks to monitor server status

---

## 🎉 Success!

You now have a fully integrated MCP server that works seamlessly with:
- ✅ Claude Desktop (via MCP protocol)
- ✅ VS Code + Claude Code (via HTTP API)
- ✅ VS Code + GitHub Copilot (via HTTP API)

The server provides intelligent documentation lookup, code generation, and validation across all major .NET, Azure, and Olympus Cloud technologies.

**Happy coding with AI-powered documentation assistance!** 🚀
