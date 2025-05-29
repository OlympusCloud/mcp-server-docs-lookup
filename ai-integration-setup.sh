#!/bin/bash

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print header
echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   MCP Server Integration Setup for AI Assistants   ${NC}"
echo -e "${BLUE}====================================================${NC}"
echo ""

# Function to check if a command exists
command_exists() {
  command -v "$1" > /dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check for npm
if ! command_exists npm; then
  echo -e "${RED}Error: npm is not installed. Please install Node.js and npm first.${NC}"
  exit 1
fi

# Check for npm version
NPM_VERSION=$(npm --version)
echo -e "${GREEN}✓ npm installed (Version: $NPM_VERSION)${NC}"

# Install the MCP server package
echo ""
echo -e "${YELLOW}Installing the MCP server package...${NC}"
npm install -g @olympuscloud/mcp-docs-server@latest --registry https://npm.pkg.github.com/

# Check if installation was successful
if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Failed to install the MCP server package. Make sure you have GitHub authentication set up.${NC}"
  echo -e "${YELLOW}Try running: echo '//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN' >> ~/.npmrc${NC}"
  exit 1
fi

echo -e "${GREEN}✓ MCP server package installed successfully${NC}"

# Create configuration directory if it doesn't exist
CONFIG_DIR="$HOME/.olympus/mcp-server"
mkdir -p "$CONFIG_DIR"

# Create config files
echo ""
echo -e "${YELLOW}Creating configuration files...${NC}"

# Main config file
cat > "$CONFIG_DIR/config.json" << EOL
{
  "server": {
    "port": 3000,
    "host": "localhost",
    "cors": {
      "enabled": true,
      "origins": ["http://localhost:*", "vscode://*"]
    }
  },
  "repositories": [
    {
      "name": "olympus-cloud-docs",
      "url": "https://github.com/OlympusCloud/olympus-cloud-docs",
      "branch": "main",
      "path": "./data/repositories/olympus-cloud-docs",
      "active": true
    },
    {
      "name": "dotnet-docs",
      "url": "https://github.com/dotnet/docs",
      "branch": "main",
      "path": "./data/repositories/dotnet-docs",
      "active": true
    },
    {
      "name": "aspnet-docs",
      "url": "https://github.com/dotnet/AspNetCore.Docs",
      "branch": "main",
      "path": "./data/repositories/aspnet-docs",
      "active": true
    },
    {
      "name": "azure-docs",
      "url": "https://github.com/MicrosoftDocs/azure-docs",
      "branch": "main",
      "path": "./data/repositories/azure-docs",
      "active": true
    }
  ],
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2",
    "dimensions": 384
  },
  "vectorStore": {
    "provider": "qdrant",
    "url": "http://localhost:6333",
    "collection": "docs_collection"
  },
  "logging": {
    "level": "info",
    "file": "logs/mcp-server.log"
  }
}
EOL

# API config file
cat > "$CONFIG_DIR/api-config.json" << EOL
{
  "server": {
    "port": 3000,
    "host": "localhost",
    "cors": {
      "enabled": true,
      "origins": ["http://localhost:*", "vscode://"]
    }
  },
  "project": {
    "name": "olympus-cloud-api",
    "description": "API server for GitHub Copilot integration"
  },
  "repositories": [],
  "mode": "api"
}
EOL

echo -e "${GREEN}✓ Configuration files created at $CONFIG_DIR${NC}"

# Create startup scripts
echo ""
echo -e "${YELLOW}Creating startup scripts...${NC}"

# MCP Server startup script
cat > "$CONFIG_DIR/start-mcp-server.sh" << EOL
#!/bin/bash
olympus-mcp --config $CONFIG_DIR/config.json
EOL

# API Server startup script
cat > "$CONFIG_DIR/start-api-server.sh" << EOL
#!/bin/bash
olympus-mcp --config $CONFIG_DIR/api-config.json
EOL

chmod +x "$CONFIG_DIR/start-mcp-server.sh"
chmod +x "$CONFIG_DIR/start-api-server.sh"

echo -e "${GREEN}✓ Startup scripts created${NC}"

# Setup VS Code Insiders settings
echo ""
echo -e "${YELLOW}Setting up VS Code Insiders integration...${NC}"

# Path to VS Code settings
VS_CODE_SETTINGS_DIR="$HOME/Library/Application Support/Code - Insiders/User"
mkdir -p "$VS_CODE_SETTINGS_DIR"

# Check if settings.json exists, create it if not
if [ ! -f "$VS_CODE_SETTINGS_DIR/settings.json" ]; then
  echo "{}" > "$VS_CODE_SETTINGS_DIR/settings.json"
fi

# Function to update VS Code settings
update_vscode_settings() {
  local temp_file=$(mktemp)
  jq --arg url "http://localhost:3000" '.["claude.modelContext.server"] = $url | .["github.copilot.advanced"] = {"serverEndpoint": $url}' "$VS_CODE_SETTINGS_DIR/settings.json" > "$temp_file"
  mv "$temp_file" "$VS_CODE_SETTINGS_DIR/settings.json"
}

# Check if jq is installed
if command_exists jq; then
  update_vscode_settings
  echo -e "${GREEN}✓ VS Code Insiders settings updated${NC}"
else
  echo -e "${YELLOW}Warning: jq is not installed. Please manually update your VS Code Insiders settings:${NC}"
  echo -e "${YELLOW}Add the following to your settings.json:${NC}"
  echo -e "${YELLOW}  \"claude.modelContext.server\": \"http://localhost:3000\",${NC}"
  echo -e "${YELLOW}  \"github.copilot.advanced\": {${NC}"
  echo -e "${YELLOW}    \"serverEndpoint\": \"http://localhost:3000\"${NC}"
  echo -e "${YELLOW}  }${NC}"
fi

# Instructions for configuring Claude Desktop
echo ""
echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}                Setup Instructions                   ${NC}"
echo -e "${BLUE}====================================================${NC}"
echo ""
echo -e "${YELLOW}To start the MCP server:${NC}"
echo -e "  ${GREEN}$CONFIG_DIR/start-mcp-server.sh${NC}"
echo ""
echo -e "${YELLOW}To start the API server for GitHub Copilot:${NC}"
echo -e "  ${GREEN}$CONFIG_DIR/start-api-server.sh${NC}"
echo ""
echo -e "${YELLOW}For Claude Desktop:${NC}"
echo -e "  ${GREEN}1. Open Claude Desktop${NC}"
echo -e "  ${GREEN}2. Go to Settings > Advanced${NC}"
echo -e "  ${GREEN}3. Set the MCP Server URL to: http://localhost:3000${NC}"
echo -e "  ${GREEN}4. Save and restart Claude Desktop${NC}"
echo ""
echo -e "${YELLOW}For VS Code with Claude Code:${NC}"
echo -e "  ${GREEN}1. Ensure you have the Claude AI extension installed${NC}"
echo -e "  ${GREEN}2. Settings have been updated to use http://localhost:3000${NC}"
echo ""
echo -e "${YELLOW}For VS Code with GitHub Copilot:${NC}"
echo -e "  ${GREEN}1. Ensure you have the GitHub Copilot extension installed${NC}"
echo -e "  ${GREEN}2. Settings have been updated to use the API server${NC}"
echo ""
echo -e "${BLUE}====================================================${NC}"
echo -e "${GREEN}Integration setup complete! Happy coding!${NC}"
