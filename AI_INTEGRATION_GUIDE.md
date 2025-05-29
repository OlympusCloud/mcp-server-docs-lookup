# AI Integration Setup Guide

This guide will help you set up the Olympus Cloud MCP Server with VS Code Insiders, Claude Code, Claude Desktop, and GitHub Copilot.

## Prerequisites

1. **Node.js and npm** - Ensure you have Node.js 18+ and npm installed
2. **GitHub Personal Access Token** - Required for GitHub Packages access
3. **VS Code Insiders** - For the latest features and extensions
4. **Claude Desktop** or **Claude Code extension** - For Claude AI integration
5. **GitHub Copilot extension** - For GitHub Copilot integration

## Step 1: GitHub Authentication Setup

1. **Create a GitHub Personal Access Token:**
   - Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Select the following scopes:
     - `read:packages` - Required for installing from GitHub Packages
     - `repo` - Required for repository access (if needed)
   - Copy the generated token

2. **Configure npm for GitHub Packages:**
   ```bash
   # Replace YOUR_GITHUB_TOKEN with your actual token
   echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
   ```

   Or set it as an environment variable:
   ```bash
   export NPM_TOKEN=YOUR_GITHUB_TOKEN
   echo "//npm.pkg.github.com/:_authToken=\${NPM_TOKEN}" >> ~/.npmrc
   ```

## Step 2: Install the MCP Server

Run the automated setup script:

```bash
./ai-integration-setup.sh
```

Or install manually:

```bash
# Install the package globally
npm install -g @olympuscloud/mcp-docs-server@latest --registry https://npm.pkg.github.com/

# Verify installation
olympus-mcp --version
```

## Step 3: Configuration

The setup script creates configuration files at `~/.olympus/mcp-server/`:

- `config.json` - Main MCP server configuration
- `api-config.json` - API server configuration for GitHub Copilot
- `start-mcp-server.sh` - Script to start the MCP server
- `start-api-server.sh` - Script to start the API server

## Step 4: Start the Servers

### For Claude Code and Claude Desktop:
```bash
~/.olympus/mcp-server/start-mcp-server.sh
```
This starts the MCP server on `http://localhost:3000`

### For GitHub Copilot:
```bash
~/.olympus/mcp-server/start-api-server.sh
```
This starts the API server on `http://localhost:3000`

## Step 5: Configure AI Tools

### VS Code Insiders with Claude Code Extension

1. Install the Claude AI extension in VS Code Insiders
2. Open VS Code settings (`Cmd+,` on macOS)
3. Add or update these settings:
   ```json
   {
     "claude.modelContext.server": "http://localhost:3000",
     "claude.serverEndpoint": "http://localhost:3000"
   }
   ```

### VS Code Insiders with GitHub Copilot

1. Install the GitHub Copilot extension in VS Code Insiders
2. Open VS Code settings (`Cmd+,` on macOS)
3. Add or update these settings:
   ```json
   {
     "github.copilot.advanced": {
       "serverEndpoint": "http://localhost:3000"
     }
   }
   ```

### Claude Desktop

1. Open Claude Desktop
2. Go to Settings → Advanced
3. Set the MCP Server URL to: `http://localhost:3000`
4. Save and restart Claude Desktop

## Step 6: Test the Integration

### Test with Claude Code in VS Code:
1. Open a .NET, Azure, or documentation file
2. Try asking Claude Code for help with Olympus Cloud patterns
3. You should see responses that include context from the documentation

### Test with GitHub Copilot:
1. Open a code file
2. Start typing code related to Azure Functions, .NET, or ASP.NET
3. Copilot should provide suggestions enhanced with Olympus Cloud patterns

### Test with Claude Desktop:
1. Ask questions about Olympus Cloud architecture
2. Request code examples for Azure Functions with KEDA
3. Ask about .NET 9/10 best practices

## Troubleshooting

### Authentication Issues:
- Verify your GitHub token has the correct permissions
- Check that ~/.npmrc contains the correct authentication line
- Try logging out and back into GitHub: `npm logout --registry https://npm.pkg.github.com/`

### Server Connection Issues:
- Ensure the server is running on the correct port (3000)
- Check firewall settings
- Verify VS Code settings are correctly configured

### Package Installation Issues:
- Clear npm cache: `npm cache clean --force`
- Try installing with verbose output: `npm install -g @olympuscloud/mcp-docs-server@latest --registry https://npm.pkg.github.com/ --verbose`

## Available Commands

Once installed, you can use these commands:

```bash
# Start the MCP server
olympus-mcp --config ~/.olympus/mcp-server/config.json

# Start in API mode for GitHub Copilot
olympus-mcp --config ~/.olympus/mcp-server/api-config.json

# Check version
olympus-mcp --version

# Get help
olympus-mcp --help
```

## Documentation Coverage

The MCP server provides context for:

- **Olympus Cloud Architecture** - Microservices, event-driven patterns
- **.NET 9/10** - Latest features and best practices
- **ASP.NET Core** - Web APIs, minimal APIs, authentication
- **Blazor MAUI Hybrid** - Cross-platform app development
- **Azure Functions** - Serverless computing with KEDA scaling
- **Azure Kubernetes Service (AKS)** - Container orchestration
- **Istio Service Mesh** - Traffic management and security
- **ArgoCD GitOps** - Continuous deployment patterns

## Support

For issues or questions:
- Check the [GitHub repository](https://github.com/OlympusCloud/mcp-server-docs-lookup)
- Review the troubleshooting documentation
- Create an issue for bugs or feature requests
