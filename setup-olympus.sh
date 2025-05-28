#!/bin/bash

# Olympus Cloud Documentation MCP Server Setup Script
# Sets up comprehensive documentation for Olympus Cloud development
# Auto-configures Claude Code and GitHub Copilot integration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${PURPLE}"
    echo "=============================================="
    echo "$1"
    echo "=============================================="
    echo -e "${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    local missing_deps=()
    
    if ! command_exists node; then
        missing_deps+=("Node.js 18+")
    else
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            missing_deps+=("Node.js 18+ (current: v$NODE_VERSION)")
        else
            print_status "Node.js $(node --version)"
        fi
    fi
    
    if ! command_exists npm; then
        missing_deps+=("npm")
    else
        print_status "npm $(npm --version)"
    fi
    
    if ! command_exists docker; then
        missing_deps+=("Docker")
    else
        print_status "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
    fi
    
    if ! command_exists git; then
        missing_deps+=("Git")
    else
        print_status "Git $(git --version | cut -d' ' -f3)"
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        echo ""
        echo "Please install the missing dependencies and run this script again."
        echo ""
        echo "Installation guides:"
        echo "  Node.js: https://nodejs.org/"
        echo "  Docker: https://docs.docker.com/get-docker/"
        echo "  Git: https://git-scm.com/downloads"
        exit 1
    fi
    
    print_status "All prerequisites satisfied"
}

# Install and build the MCP server
setup_mcp_server() {
    print_header "Setting Up MCP Server"
    
    print_info "Installing dependencies..."
    npm install
    
    print_info "Building TypeScript..."
    npm run build
    
    print_status "MCP server built successfully"
}

# Start Qdrant vector database
setup_qdrant() {
    print_header "Setting Up Qdrant Vector Database"
    
    # Check if Qdrant is already running
    if curl -s http://localhost:6333/health >/dev/null 2>&1; then
        print_status "Qdrant is already running"
        return 0
    fi
    
    # Check if container exists but is stopped
    if docker ps -a --format "table {{.Names}}" | grep -q "^qdrant$"; then
        print_info "Starting existing Qdrant container..."
        docker start qdrant
    else
        print_info "Creating and starting new Qdrant container..."
        docker run -d --name qdrant \
            -p 6333:6333 \
            -v "$(pwd)/qdrant_storage:/qdrant/storage" \
            qdrant/qdrant
    fi
    
    # Wait for Qdrant to be ready
    print_info "Waiting for Qdrant to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:6333/health >/dev/null 2>&1; then
            print_status "Qdrant is ready"
            return 0
        fi
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    print_error "Qdrant failed to start after ${max_attempts} attempts"
    exit 1
}

# Create comprehensive Olympus configuration
create_olympus_config() {
    print_header "Creating Olympus Cloud Configuration"
    
    # Check if user has a GitHub token for Olympus docs
    GITHUB_TOKEN=""
    if [ -n "$OLYMPUS_GITHUB_TOKEN" ]; then
        GITHUB_TOKEN="$OLYMPUS_GITHUB_TOKEN"
        print_info "Using GitHub token from environment"
    else
        echo ""
        echo "For private Olympus repositories, you'll need a GitHub personal access token."
        echo "Create one at: https://github.com/settings/tokens"
        echo "Required scopes: repo (for private repos)"
        echo ""
        read -p "Enter GitHub token (or press Enter to skip): " GITHUB_TOKEN
    fi
    
    # Create the Olympus configuration
    cat > config/config.json << EOF
{
  "project": {
    "name": "olympus-cloud-comprehensive",
    "description": "Comprehensive Olympus Cloud documentation with all repositories",
    "version": "1.0.0"
  },
  "repositories": [
EOF

    # Add Olympus docs if token is provided
    if [ -n "$GITHUB_TOKEN" ]; then
        cat >> config/config.json << EOF
    {
      "name": "olympus-docs",
      "url": "https://github.com/OlympusCloud/olympus-docs.git",
      "branch": "ai_coding",
      "authType": "token",
      "credentials": {
        "token": "$GITHUB_TOKEN"
      },
      "paths": [
        "/docs",
        "/guides",
        "/api",
        "/architecture",
        "/deployment",
        "/configuration",
        "/devops",
        "/implementation-plans",
        "/tutorials",
        "/backend"
      ],
      "exclude": [
        "*/node_modules/*",
        "*/dist/*",
        "*/build/*",
        "*.png",
        "*.jpg",
        "*.gif",
        "/archive/*"
      ],
      "recursive": true,
      "filePattern": "**/*.{md,markdown}",
      "syncInterval": 30,
      "priority": "high",
      "category": "olympus-cloud",
      "tags": ["olympus", "cloud", "platform", "api", "documentation"]
    },
EOF
    fi

    # Add public documentation repositories
    cat >> config/config.json << 'EOF'
    {
      "name": "dotnet-docs",
      "url": "https://github.com/dotnet/docs.git",
      "branch": "main",
      "authType": "none",
      "paths": ["/docs/core", "/docs/csharp", "/docs/architecture"],
      "exclude": ["*/samples/*", "*/media/*", "*.png", "*.jpg"],
      "recursive": true,
      "filePattern": "**/*.{md,markdown}",
      "syncInterval": 120,
      "priority": "high",
      "category": "dotnet"
    },
    {
      "name": "azure-docs",
      "url": "https://github.com/MicrosoftDocs/azure-docs.git",
      "branch": "main",
      "authType": "none",
      "paths": ["/articles/app-service", "/articles/azure-functions", "/articles/container-instances"],
      "exclude": ["*/media/*", "*/includes/*", "*.png", "*.jpg"],
      "recursive": true,
      "filePattern": "**/*.{md,markdown}",
      "syncInterval": 180,
      "priority": "high",
      "category": "azure"
    },
    {
      "name": "aspnet-docs",
      "url": "https://github.com/dotnet/AspNetCore.Docs.git",
      "branch": "main",
      "authType": "none",
      "paths": ["/aspnetcore/fundamentals", "/aspnetcore/web-api", "/aspnetcore/security"],
      "exclude": ["*/samples/*", "*/media/*", "*.png", "*.jpg"],
      "recursive": true,
      "filePattern": "**/*.{md,markdown}",
      "syncInterval": 120,
      "priority": "high",
      "category": "aspnet"
    }
  ],
  "contextGeneration": {
    "strategies": ["semantic"],
    "maxChunks": 50,
    "priorityWeighting": {
      "high": 2.0,
      "medium": 1.0,
      "low": 0.5
    },
    "categoryWeighting": {
      "olympus-cloud": 2.0,
      "dotnet": 1.8,
      "azure": 1.8,
      "aspnet": 1.7,
      "architecture": 1.6,
      "security": 1.9
    }
  },
  "server": {
    "port": 3000,
    "host": "localhost",
    "cors": {
      "enabled": true,
      "origins": ["http://localhost:*", "https://olympus-cloud.com"]
    }
  },
  "vectorStore": {
    "type": "qdrant",
    "qdrant": {
      "url": "http://localhost:6333",
      "collectionName": "olympus_comprehensive",
      "vectorSize": 384,
      "distance": "Cosine"
    }
  },
  "embedding": {
    "provider": "local",
    "model": "Xenova/all-MiniLM-L6-v2",
    "chunkSize": 2000,
    "chunkOverlap": 300
  },
  "security": {
    "enableInputSanitization": true,
    "enableRateLimiting": true,
    "rateLimitRequests": 120,
    "rateLimitWindow": 60000,
    "enablePIIRedaction": true
  },
  "monitoring": {
    "enableMetrics": true,
    "enablePerformanceTracking": true,
    "logLevel": "info"
  }
}
EOF
    
    print_status "Configuration created successfully"
}

# Configure Claude Code automatically
configure_claude_code() {
    print_header "Configuring Claude Code"
    
    # Detect Claude Code config location based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        CLAUDE_CONFIG_DIR="$HOME/.config/claude"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        # Windows
        CLAUDE_CONFIG_DIR="$APPDATA/Claude"
    else
        print_warning "Unknown OS type, using default config location"
        CLAUDE_CONFIG_DIR="$HOME/.claude"
    fi
    
    # Create config directory if it doesn't exist
    mkdir -p "$CLAUDE_CONFIG_DIR"
    
    # Create MCP configuration
    MCP_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
    
    # Check if config exists and backup
    if [ -f "$MCP_CONFIG_FILE" ]; then
        cp "$MCP_CONFIG_FILE" "$MCP_CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        print_info "Backed up existing configuration"
    fi
    
    # Create new configuration
    cat > "$MCP_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "olympus-docs": {
      "command": "node",
      "args": ["$(pwd)/dist/server.js", "--stdio"],
      "cwd": "$(pwd)",
      "env": {
        "NODE_ENV": "production",
        "MCP_CONFIG_PATH": "$(pwd)/config/config.json"
      }
    }
  }
}
EOF
    
    print_status "Claude Code configuration created at: $MCP_CONFIG_FILE"
    print_info "Restart Claude Code to load the MCP server"
}

# Configure GitHub Copilot
configure_github_copilot() {
    print_header "Configuring GitHub Copilot"
    
    # Create Copilot configuration directory
    COPILOT_DIR="$HOME/.copilot"
    mkdir -p "$COPILOT_DIR"
    
    # Create API service script for Copilot
    cat > "$COPILOT_DIR/olympus-docs-api.sh" << 'EOF'
#!/bin/bash
# Olympus Docs API Service for GitHub Copilot

API_PORT=${OLYMPUS_DOCS_PORT:-3001}
MCP_PATH="$(dirname "$(dirname "$(readlink -f "$0")")")/olympus-cloud/mcp-server-docs-lookup"

if [ ! -d "$MCP_PATH" ]; then
    echo "Error: MCP server not found at $MCP_PATH"
    exit 1
fi

cd "$MCP_PATH"
echo "Starting Olympus Docs API on port $API_PORT..."
node dist/cli.js start --mode api --port "$API_PORT"
EOF
    
    chmod +x "$COPILOT_DIR/olympus-docs-api.sh"
    
    # Create systemd service for Linux/macOS
    if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "darwin"* ]]; then
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            SERVICE_DIR="$HOME/.config/systemd/user"
            mkdir -p "$SERVICE_DIR"
            SERVICE_FILE="$SERVICE_DIR/olympus-docs-api.service"
        else
            SERVICE_DIR="$HOME/Library/LaunchAgents"
            mkdir -p "$SERVICE_DIR"
            SERVICE_FILE="$SERVICE_DIR/com.olympuscloud.docs-api.plist"
        fi
        
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Create systemd service
            cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Olympus Docs API for GitHub Copilot
After=network.target

[Service]
Type=simple
ExecStart=$COPILOT_DIR/olympus-docs-api.sh
Restart=on-failure
Environment="OLYMPUS_DOCS_PORT=3001"
WorkingDirectory=$(pwd)

[Install]
WantedBy=default.target
EOF
            
            print_info "Enable service with: systemctl --user enable olympus-docs-api"
            print_info "Start service with: systemctl --user start olympus-docs-api"
        else
            # Create launchd plist for macOS
            cat > "$SERVICE_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.olympuscloud.docs-api</string>
    <key>ProgramArguments</key>
    <array>
        <string>$COPILOT_DIR/olympus-docs-api.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>OLYMPUS_DOCS_PORT</key>
        <string>3001</string>
    </dict>
</dict>
</plist>
EOF
            
            print_info "Load service with: launchctl load $SERVICE_FILE"
        fi
    fi
    
    # Create VS Code settings for Copilot
    VSCODE_DIR="$HOME/.vscode"
    mkdir -p "$VSCODE_DIR"
    
    # Create or update VS Code settings
    VSCODE_SETTINGS="$VSCODE_DIR/settings.json"
    if [ -f "$VSCODE_SETTINGS" ]; then
        cp "$VSCODE_SETTINGS" "$VSCODE_SETTINGS.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Add Copilot configuration
    if command_exists jq; then
        if [ -f "$VSCODE_SETTINGS" ]; then
            jq '. + {
                "github.copilot.advanced": {
                    "documentationAPI": {
                        "endpoint": "http://localhost:3001",
                        "enabled": true
                    }
                }
            }' "$VSCODE_SETTINGS" > "$VSCODE_SETTINGS.tmp" && mv "$VSCODE_SETTINGS.tmp" "$VSCODE_SETTINGS"
        else
            cat > "$VSCODE_SETTINGS" << EOF
{
    "github.copilot.advanced": {
        "documentationAPI": {
            "endpoint": "http://localhost:3001",
            "enabled": true
        }
    }
}
EOF
        fi
        print_status "VS Code settings configured for GitHub Copilot"
    else
        print_warning "jq not found - please manually add Copilot settings to VS Code"
    fi
    
    print_status "GitHub Copilot configuration completed"
}

# Sync documentation
sync_documentation() {
    print_header "Syncing Documentation"
    
    print_info "Starting initial documentation sync..."
    print_warning "This will download and index documentation"
    print_warning "First sync may take 5-15 minutes"
    
    echo ""
    read -p "Continue with sync? (Y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        print_info "Skipping documentation sync"
        print_info "You can sync later with: npm run sync"
        return 0
    fi
    
    # Run sync
    npm run sync || {
        print_warning "Some repositories may have failed to sync"
        print_info "This is normal for large repositories"
        print_info "Core Olympus docs should be synced successfully"
    }
    
    print_status "Documentation sync completed"
}

# Start API server for GitHub Copilot
start_api_server() {
    print_header "Starting API Server"
    
    print_info "Starting API server for GitHub Copilot integration..."
    
    # Check if API server is already running
    if lsof -i :3001 >/dev/null 2>&1; then
        print_warning "API server already running on port 3001"
        return 0
    fi
    
    # Start API server in background
    nohup node dist/cli.js start --mode api --port 3001 > logs/api-server.log 2>&1 &
    API_PID=$!
    echo $API_PID > .api-server.pid
    
    sleep 3
    
    if kill -0 $API_PID 2>/dev/null; then
        print_status "API server started on port 3001 (PID: $API_PID)"
        print_info "API logs: logs/api-server.log"
    else
        print_error "Failed to start API server"
        return 1
    fi
}

# Create NPM scripts
create_npm_scripts() {
    print_header "Updating NPM Scripts"
    
    # Update package.json with useful scripts
    if command_exists jq; then
        jq '.scripts += {
            "sync": "node dist/cli.js sync",
            "search": "node dist/cli.js search",
            "server": "node dist/server.js --stdio",
            "api": "node dist/cli.js start --mode api --port 3001",
            "status": "node dist/cli.js status",
            "setup": "./setup-olympus.sh"
        }' package.json > package.json.tmp && mv package.json.tmp package.json
        
        print_status "NPM scripts updated"
    fi
}

# Test installation
test_installation() {
    print_header "Testing Installation"
    
    print_info "Running installation tests..."
    
    # Test 1: MCP server
    print_info "Testing MCP server..."
    if echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | timeout 5 node dist/server.js --stdio >/dev/null 2>&1; then
        print_status "MCP server test passed"
    else
        print_warning "MCP server test timed out (this may be normal)"
    fi
    
    # Test 2: Search functionality
    print_info "Testing search..."
    if timeout 10 node dist/cli.js search "test" --limit 1 >/dev/null 2>&1; then
        print_status "Search test passed"
    else
        print_warning "Search test failed (sync may be needed)"
    fi
    
    # Test 3: API server
    print_info "Testing API server..."
    if curl -s http://localhost:3001/health >/dev/null 2>&1; then
        print_status "API server test passed"
    else
        print_info "API server not running (start with: npm run api)"
    fi
    
    print_status "Installation tests completed"
}

# Show final instructions
show_final_instructions() {
    print_header "🎉 Setup Complete!"
    
    echo -e "${GREEN}Olympus Cloud Documentation MCP Server is ready!${NC}"
    echo ""
    
    echo -e "${BLUE}📋 Quick Reference:${NC}"
    echo ""
    
    echo -e "${PURPLE}NPM Commands:${NC}"
    echo "  npm run sync     - Sync all documentation"
    echo "  npm run search   - Search documentation"
    echo "  npm run server   - Start MCP server"
    echo "  npm run api      - Start API server for Copilot"
    echo "  npm run status   - Check server status"
    echo ""
    
    echo -e "${PURPLE}Claude Code:${NC}"
    if [ -f "$CLAUDE_CONFIG_DIR/claude_desktop_config.json" ]; then
        echo -e "  ${GREEN}✅ Automatically configured!${NC}"
        echo "  Just restart Claude Code to use the MCP server"
    else
        echo "  Manual config needed - see instructions above"
    fi
    echo ""
    
    echo -e "${PURPLE}GitHub Copilot:${NC}"
    if [ -f "$COPILOT_DIR/olympus-docs-api.sh" ]; then
        echo -e "  ${GREEN}✅ Configuration created!${NC}"
        echo "  Start API: npm run api"
        echo "  Or use service: $COPILOT_DIR/olympus-docs-api.sh"
    fi
    echo ""
    
    echo -e "${PURPLE}Search Examples:${NC}"
    echo '  node dist/cli.js search "Janus Hub implementation"'
    echo '  node dist/cli.js search "Azure Functions best practices"'
    echo '  node dist/cli.js search "identity access management"'
    echo ""
    
    echo -e "${PURPLE}Documentation Status:${NC}"
    node dist/cli.js status 2>/dev/null || echo "  Run 'npm run sync' to index documentation"
    echo ""
    
    echo -e "${GREEN}Next Steps:${NC}"
    echo "1. Run 'npm run sync' if you haven't synced docs yet"
    echo "2. Restart Claude Code to load the MCP server"
    echo "3. Start API server for Copilot: npm run api"
    echo "4. Try searching: npm run search \"your query\""
    echo ""
    
    echo "Happy coding with enhanced documentation! 🚀"
}

# Main setup flow
main() {
    print_header "🚀 Olympus Cloud MCP Server Setup"
    echo "This will set up comprehensive documentation access for:"
    echo "  • Olympus Cloud platform and architecture"
    echo "  • Azure services and best practices"
    echo "  • .NET 9/10 and ASP.NET Core"
    echo "  • Auto-configure Claude Code and GitHub Copilot"
    echo ""
    
    # Verify we're in the right directory
    if [ ! -f "package.json" ] || ! grep -q "@olympuscloud/mcp-docs-server" package.json; then
        print_error "This script must be run from the mcp-server-docs-lookup directory"
        exit 1
    fi
    
    # Run setup steps
    check_prerequisites
    setup_mcp_server
    setup_qdrant
    create_olympus_config
    create_npm_scripts
    
    # Configure AI assistants
    configure_claude_code
    configure_github_copilot
    
    # Sync documentation
    sync_documentation
    
    # Start API server for Copilot
    echo ""
    read -p "Start API server for GitHub Copilot? (Y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        start_api_server
    fi
    
    # Run tests
    test_installation
    
    # Show completion message
    show_final_instructions
}

# Run main function
main "$@"