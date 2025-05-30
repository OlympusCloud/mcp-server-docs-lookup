# Integration Guide

This guide provides comprehensive instructions for integrating the MCP Documentation Server with various AI coding assistants.

## Table of Contents

1. [Overview](#overview)
2. [Claude Integration](#claude-integration)
3. [GitHub Copilot Integration](#github-copilot-integration)
4. [VS Code Integration](#vs-code-integration)
5. [Custom AI Integration](#custom-ai-integration)
6. [Authenticating with Repositories](#authenticating-with-repositories)
7. [Advanced Configuration](#advanced-configuration)

## Overview

The MCP Documentation Server provides a universal documentation access point for AI coding assistants. It implements the [Model Context Protocol](https://github.com/modelcontextprotocol/specification) (MCP) to deliver relevant documentation context to AI assistants.

Integration benefits include:

- AI assistants can access local documentation and repository knowledge
- Context-aware responses that incorporate your organization's best practices
- Secure, local processing of documentation with no data sent to external services
- Customizable behavior for different repositories and use cases

## Claude Integration

### Claude Desktop Integration

Claude Desktop can connect directly to the MCP server to access documentation.

1. **Update Claude Desktop configuration**:

   Edit the Claude Desktop configuration file:

   ```json
   {
     "mcp": {
       "enabled": true,
       "url": "http://localhost:3000",
       "timeout": 10000
     }
   }
   ```

   Configuration file locations:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\\Claude\\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Restart Claude Desktop**:

   Close and reopen Claude Desktop for changes to take effect.

3. **Test integration**:

   Ask Claude a question about your documentation to verify the integration:

   ```
   How does the MCP server work? Use the context from my documentation.
   ```

### Claude in Cursor Integration

1. **Install the MCP plugin for Cursor**:

   ```bash
   curl https://raw.githubusercontent.com/cursor-ai/mcp-plugin/main/install.sh | bash
   ```

2. **Configure MCP server URL**:

   In Cursor settings, set:

   ```json
   "mcp.server.url": "http://localhost:3000"
   ```

3. **Test in Cursor**:

   Open Cursor and try asking Claude about your documentation.

## GitHub Copilot Integration

### GitHub Copilot in VS Code

1. **Install the Copilot Language Model API extension in VS Code**:

   Install from the VS Code marketplace or run:

   ```
   ext install github.copilot github.copilot-chat github.copilot-language-model-api
   ```

2. **Configure Copilot to use the MCP server**:

   Edit your VS Code settings.json:

   ```json
   "github.copilot.advanced": {
     "language.model.api.endpoint": "http://localhost:3001/copilot/"
   }
   ```

3. **Restart VS Code**:

   For settings to take effect.

4. **Test integration**:

   Open GitHub Copilot Chat and ask a question about your documentation:

   ```
   /doc What is the architecture of the MCP server?
   ```

### GitHub Copilot in JetBrains IDEs

1. **Install JetBrains Copilot plugin**:

   From the JetBrains Marketplace, install GitHub Copilot.

2. **Configure endpoint**:

   Edit `.ideasettings/copilot.xml`:

   ```xml
   <application>
     <component name="github.copilot">
       <option name="languageModelApiEndpoint" value="http://localhost:3001/copilot/" />
     </component>
   </application>
   ```

3. **Restart IDE**:

   For settings to take effect.

## VS Code Integration

### Visual Studio Code Direct Integration

1. **Install MCP Client Extension**:

   Install the MCP Client extension from the VS Code marketplace.

2. **Configure extension**:

   Edit your VS Code settings.json:

   ```json
   "mcpClient.serverUrl": "http://localhost:3001",
   "mcpClient.autoConnect": true
   ```

3. **Use MCP commands**:

   Use the Command Palette (Ctrl+Shift+P) to access MCP functions:

   - `MCP: Search Documentation`
   - `MCP: Show Documentation for Selection`
   - `MCP: Generate Context for Current File`

### Continue.dev Integration

1. **Install Continue extension**:

   Install the Continue extension from the VS Code marketplace.

2. **Configure Continue to use MCP**:

   Edit the Continue configuration:

   ```json
   {
     "contextProviders": [
       {
         "type": "mcp",
         "name": "Documentation",
         "url": "http://localhost:3001"
       }
     ]
   }
   ```

3. **Test integration**:

   Use Continue commands to query your documentation.

## Custom AI Integration

### Custom MCP Client Implementation

For custom integrations, implement the MCP client protocol:

1. **Connect to the server**:

   ```typescript
   // Example MCP client connection
   async function connectToMCP(url = "http://localhost:3001") {
     const response = await fetch(`${url}/health`);
     if (!response.ok) throw new Error("Failed to connect to MCP server");
     return new MCPClient(url);
   }
   ```

2. **Request context**:

   ```typescript
   // Example context request
   async function getContext(query, maxResults = 5) {
     const client = await connectToMCP();
     return client.getContext({
       query,
       maxResults,
       includeContent: true
     });
   }
   ```

3. **Process responses**:

   Handle the structured response from the MCP server.

## Authenticating with Repositories

### SSH Authentication

1. **Generate SSH Key**:

   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. **Configure repositories in config.json**:

   ```json
   "repositories": [
     {
       "name": "private-repo",
       "url": "git@github.com:organization/repo.git",
       "authType": "ssh"
     }
   ]
   ```

### Token Authentication

1. **Create Personal Access Token**:

   Generate a token with `repo` scope from your Git provider.

2. **Configure repositories in config.json**:

   ```json
   "repositories": [
     {
       "name": "private-repo",
       "url": "https://github.com/organization/repo.git",
       "authType": "token",
       "token": "YOUR_TOKEN"
     }
   ]
   ```

## Advanced Configuration

### Custom Metadata Tags

Add custom metadata to improve context retrieval:

```json
"repositories": [
  {
    "name": "my-repository",
    "metadata": {
      "tags": ["api", "documentation", "internal"],
      "priority": "high",
      "category": "core"
    }
  }
]
```

### Integration Hooks

Configure pre and post-processing hooks for document context:

```json
"hooks": {
  "preProcess": "scripts/pre-process.js",
  "postProcess": "scripts/post-process.js"
}
```

### Proxy Configuration

For integrations behind corporate proxies:

```json
"proxy": {
  "url": "http://proxy.example.com:8080",
  "noProxy": ["localhost", "127.0.0.1"]
}
```
