#!/bin/bash

# Final integration setup script for MCP Server with AI Assistants
# This script sets up the MCP server for use with Claude Code, Claude Desktop, and GitHub Copilot

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Final MCP Server Integration Setup${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check if package is installed
if ! command -v olympus-mcp &> /dev/null; then
    echo -e "${YELLOW}Installing MCP server package...${NC}"
    npm install -g @olympuscloud/mcp-docs-server@latest --registry https://npm.pkg.github.com/
    echo -e "${GREEN}✅ Package installed${NC}"
else
    echo -e "${GREEN}✅ MCP server package already installed${NC}"
fi

# Create config directory
CONFIG_DIR="$HOME/.config/olympus-mcp"
mkdir -p "$CONFIG_DIR"

echo -e "${YELLOW}Creating configuration files in $CONFIG_DIR...${NC}"

# Create MCP config for Claude Desktop
cat > "$CONFIG_DIR/claude-desktop.json" << 'EOF'
{
  "mcpServers": {
    "olympus-docs": {
      "command": "olympus-mcp",
      "args": ["--mode", "stdio", "--config", "olympus-cloud"],
      "env": {}
    }
  }
}
EOF

# Create VS Code settings for Claude Code
cat > "$CONFIG_DIR/vscode-claude-settings.json" << 'EOF'
{
  "claude.modelContext.server": "http://localhost:3001",
  "claude.modelContext.enabled": true,
  "claude.modelContext.maxResults": 10
}
EOF

# Create VS Code settings for GitHub Copilot
cat > "$CONFIG_DIR/vscode-copilot-settings.json" << 'EOF'
{
  "github.copilot.advanced": {
    "serverEndpoint": "http://localhost:3001"
  },
  "github.copilot.enable": {
    "*": true,
    "plaintext": false,
    "markdown": true,
    "typescript": true,
    "csharp": true
  }
}
EOF

# Create startup scripts
cat > "$CONFIG_DIR/start-api-server.sh" << 'EOF'
#!/bin/bash
echo "🚀 Starting MCP API Server for GitHub Copilot and Claude Code..."
olympus-mcp --mode api --port 3001 --config olympus-cloud
EOF

cat > "$CONFIG_DIR/start-mcp-stdio.sh" << 'EOF'
#!/bin/bash
echo "🚀 Starting MCP Server in STDIO mode for Claude Desktop..."
olympus-mcp --mode stdio --config olympus-cloud
EOF

chmod +x "$CONFIG_DIR/start-api-server.sh"
chmod +x "$CONFIG_DIR/start-mcp-stdio.sh"

echo -e "${GREEN}✅ Configuration files created${NC}"

echo ""
echo -e "${BLUE}📋 Integration Instructions${NC}"
echo -e "${BLUE}=========================${NC}"
echo ""

echo -e "${YELLOW}1. For Claude Desktop:${NC}"
echo -e "   Copy the configuration from: ${GREEN}$CONFIG_DIR/claude-desktop.json${NC}"
echo -e "   To your Claude Desktop config file"
echo ""

echo -e "${YELLOW}2. For VS Code with Claude Code:${NC}"
echo -e "   Start API server: ${GREEN}$CONFIG_DIR/start-api-server.sh${NC}"
echo -e "   Add settings from: ${GREEN}$CONFIG_DIR/vscode-claude-settings.json${NC}"
echo -e "   To your VS Code settings.json"
echo ""

echo -e "${YELLOW}3. For VS Code with GitHub Copilot:${NC}"
echo -e "   Start API server: ${GREEN}$CONFIG_DIR/start-api-server.sh${NC}"
echo -e "   Add settings from: ${GREEN}$CONFIG_DIR/vscode-copilot-settings.json${NC}"
echo -e "   To your VS Code settings.json"
echo ""

echo -e "${GREEN}🎉 Setup complete! Your MCP server is ready for AI assistant integration.${NC}"
