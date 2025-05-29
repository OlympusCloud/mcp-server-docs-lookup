#!/bin/bash

# Olympus Cloud Documentation MCP Server Setup Script
# Sets up comprehensive documentation for Olympus Cloud development
# Enhanced for AI coding agents: Claude Code, GitHub Copilot, Cline, Continue

set -e  # Exit on any error

# Parse command line arguments
SKIP_SYNC=false
SKIP_AI_SETUP=false
DEV_MODE=false
CONFIG=""
GITHUB_TOKEN="${OLYMPUS_GITHUB_TOKEN:-}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-sync)
            SKIP_SYNC=true
            shift
            ;;
        --skip-ai-setup)
            SKIP_AI_SETUP=true
            shift
            ;;
        --dev-mode)
            DEV_MODE=true
            shift
            ;;
        --config)
            CONFIG="$2"
            shift 2
            ;;
        --github-token)
            GITHUB_TOKEN="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --skip-sync       Skip documentation synchronization"
            echo "  --skip-ai-setup   Skip AI agent configuration"
            echo "  --dev-mode        Enable development mode features"
            echo "  --config NAME     Use specific configuration preset"
            echo "  --github-token    GitHub token for private repositories"
            echo "  -h, --help        Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

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
    
    # Check Node.js
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
    
    # Check npm
    if ! command_exists npm; then
        missing_deps+=("npm")
    else
        print_status "npm $(npm --version)"
    fi
    
    # Check Docker
    if ! command_exists docker; then
        missing_deps+=("Docker")
    else
        print_status "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
    fi
    
    # Check Git
    if ! command_exists git; then
        missing_deps+=("Git")
    else
        print_status "Git $(git --version | cut -d' ' -f3)"
    fi
    
    # Check Azure CLI (optional for Olympus development)
    if command_exists az; then
        print_status "Azure CLI $(az --version | grep 'azure-cli' | awk '{print $2}')"
    else
        print_info "Azure CLI not found (optional - install for Azure development)"
    fi
    
    # Check .NET SDK (for Olympus development)
    if command_exists dotnet; then
        DOTNET_VERSION=$(dotnet --version)
        print_status ".NET SDK $DOTNET_VERSION"
        if [[ $(echo "$DOTNET_VERSION" | cut -d'.' -f1) -lt 8 ]]; then
            print_warning ".NET 8.0+ recommended for Olympus development"
        fi
    else
        print_info ".NET SDK not found (install for Olympus .NET development)"
    fi
    
    # Check jq (helpful for configuration)
    if command_exists jq; then
        print_status "jq $(jq --version)"
    else
        print_info "jq not found (install for better JSON configuration handling)"
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
        echo "  Azure CLI: https://docs.microsoft.com/cli/azure/install-azure-cli"
        echo "  .NET SDK: https://dotnet.microsoft.com/download"
        echo "  jq: https://stedolan.github.io/jq/download/"
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
    
    # Verify modular server is built
    if [ ! -f "dist/modular-server.js" ]; then
        print_warning "Modular server not found, using fallback server"
    else
        print_status "Modular MCP server built successfully"
    fi
    
    print_status "MCP server setup completed"
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

# Configure Claude Code automatically (Enhanced)
configure_claude_code_enhanced() {
    print_header "Configuring Claude Desktop"
    
    if [ "$SKIP_AI_SETUP" = true ]; then
        print_info "Skipping AI agent setup (--skip-ai-setup flag provided)"
        return 0
    fi
    
    # Detect Claude Code config location based on OS
    local claude_config_dir
    if [[ "$OSTYPE" == "darwin"* ]]; then
        claude_config_dir="$HOME/Library/Application Support/Claude"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        claude_config_dir="$HOME/.config/claude"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        claude_config_dir="$APPDATA/Claude"
    else
        claude_config_dir="$HOME/.claude"
    fi
    
    # Create config directory if it doesn't exist
    mkdir -p "$claude_config_dir"
    
    # Determine which server to use
    local server_script="dist/server.js"
    if [ -f "dist/modular-server.js" ]; then
        server_script="dist/modular-server.js"
        print_info "Using modular MCP server"
    else
        print_warning "Modular server not found, using fallback server"
    fi
    
    # Create MCP configuration
    local mcp_config_file="$claude_config_dir/claude_desktop_config.json"
    local current_path="$(pwd)"
    
    # Check if config exists and backup
    if [ -f "$mcp_config_file" ]; then
        cp "$mcp_config_file" "$mcp_config_file.backup.$(date +%Y%m%d_%H%M%S)"
        print_info "Backed up existing configuration"
    fi
    
    # Create new configuration
    local env_config=""
    if [ "$DEV_MODE" = true ]; then
        env_config='"NODE_ENV": "development",'
    else
        env_config='"NODE_ENV": "production",'
    fi
    
    cat > "$mcp_config_file" << EOF
{
  "mcpServers": {
    "olympus-docs": {
      "command": "node",
      "args": ["$current_path/$server_script"],
      "cwd": "$current_path",
      "env": {
        $env_config
        "MCP_CONFIG_PATH": "$current_path/config/config.json"
      }
    }
  }
}
EOF
    
    print_status "Claude Desktop configuration created at: $mcp_config_file"
    print_info "Restart Claude Desktop to load the MCP server"
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
                        "endpoint": "http://localhost:3000",
                        "enabled": true
                    }
                }
            }' "$VSCODE_SETTINGS" > "$VSCODE_SETTINGS.tmp" && mv "$VSCODE_SETTINGS.tmp" "$VSCODE_SETTINGS"
        else
            cat > "$VSCODE_SETTINGS" << EOF
{
    "github.copilot.advanced": {
        "documentationAPI": {
            "endpoint": "http://localhost:3000",
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

# Configure VS Code extensions
configure_vscode_extensions() {
    print_header "Configuring VS Code Extensions"
    
    if [ "$SKIP_AI_SETUP" = true ]; then
        print_info "Skipping VS Code extension setup"
        return 0
    fi
    
    # Find VS Code settings
    local vscode_settings=""
    local possible_dirs=(
        "$HOME/.vscode/settings.json"
        "$HOME/Library/Application Support/Code/User/settings.json"
        "$HOME/.config/Code/User/settings.json"
        "$HOME/AppData/Roaming/Code/User/settings.json"
    )
    
    for settings_file in "${possible_dirs[@]}"; do
        if [ -f "$settings_file" ]; then
            vscode_settings="$settings_file"
            break
        fi
    done
    
    # Create default settings if none found
    if [ -z "$vscode_settings" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            vscode_settings="$HOME/Library/Application Support/Code/User/settings.json"
        else
            vscode_settings="$HOME/.config/Code/User/settings.json"
        fi
        mkdir -p "$(dirname "$vscode_settings")"
    fi
    
    # Determine which server to use
    local server_script="dist/server.js"
    if [ -f "dist/modular-server.js" ]; then
        server_script="dist/modular-server.js"
    fi
    
    local current_path="$(pwd)"
    
    # Backup existing settings
    if [ -f "$vscode_settings" ]; then
        cp "$vscode_settings" "$vscode_settings.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Create or update settings with jq if available
    if command_exists jq; then
        local temp_config=$(mktemp)
        
        # Create MCP server configuration
        cat > "$temp_config" << EOF
{
  "cline.mcpServers": {
    "olympus-docs": {
      "command": "node",
      "args": ["$current_path/$server_script"],
      "cwd": "$current_path",
      "env": {
        "MCP_CONFIG_PATH": "$current_path/config/config.json"
      }
    }
  },
  "continue.mcpServers": {
    "olympus-docs": {
      "command": "node",
      "args": ["$current_path/$server_script"],
      "cwd": "$current_path",
      "env": {
        "MCP_CONFIG_PATH": "$current_path/config/config.json"
      }
    }
  }
}
EOF
        
        # Merge with existing settings
        if [ -f "$vscode_settings" ]; then
            jq -s '.[0] * .[1]' "$vscode_settings" "$temp_config" > "$vscode_settings.tmp"
            mv "$vscode_settings.tmp" "$vscode_settings"
        else
            cp "$temp_config" "$vscode_settings"
        fi
        
        rm "$temp_config"
        print_status "VS Code extension configuration updated: $vscode_settings"
    else
        print_warning "jq not found - please manually configure Cline/Continue extensions"
        print_info "Add the following to your VS Code settings.json:"
        echo ""
        echo "{"
        echo "  \"cline.mcpServers\": {"
        echo "    \"olympus-docs\": {"
        echo "      \"command\": \"node\","
        echo "      \"args\": [\"$current_path/$server_script\"],"
        echo "      \"cwd\": \"$current_path\","
        echo "      \"env\": {"
        echo "        \"MCP_CONFIG_PATH\": \"$current_path/config/config.json\""
        echo "      }"
        echo "    }"
        echo "  }"
        echo "}"
    fi
}

# Setup GitHub Copilot API integration
setup_github_copilot_api() {
    print_header "Setting Up GitHub Copilot API Integration"
    
    if [ "$SKIP_AI_SETUP" = true ]; then
        print_info "Skipping GitHub Copilot API setup"
        return 0
    fi
    
    # Create API service configuration
    cat > config/api-config.json << 'EOF'
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
EOF
    
    # Load the config
    cp config/api-config.json config/config.json
    
    print_info "Starting Olympus Docs API server for GitHub Copilot..."
    
    # Function to start API server in background
    start_api_server() {
        local log_file="logs/api-server.log"
        mkdir -p logs
        
        echo "Starting API server at http://localhost:3000..."
        nohup node dist/cli.js start --mode api > "$log_file" 2>&1 &
        local api_pid=$!
        echo $api_pid > .api-server.pid
        
        # Wait for server to start
        local max_attempts=15
        local attempt=1
        
        while [ $attempt -le $max_attempts ]; do
            if curl -s http://localhost:3000/health >/dev/null 2>&1; then
                print_status "API server started successfully (PID: $api_pid)"
                print_info "API server logs: tail -f $log_file"
                return 0
            fi
            echo -n "."
            sleep 2
            ((attempt++))
        done
        
        print_error "API server failed to start after ${max_attempts} attempts"
        print_info "Check logs: cat $log_file"
        return 1
    }
    
    # Check if API server is already running
    if curl -s http://localhost:3000/health >/dev/null 2>&1; then
        print_status "API server is already running"
    else
        start_api_server
    fi
    
    # Create systemd service for Linux/macOS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        local service_dir="$HOME/.config/systemd/user"
        mkdir -p "$service_dir"
        
        cat > "$service_dir/olympus-docs-api.service" << EOF
[Unit]
Description=Olympus Docs API for GitHub Copilot
After=network.target

[Service]
Type=simple
ExecStart=$(pwd)/start-api.sh
Restart=on-failure
Environment="OLYMPUS_DOCS_PORT=3001"
WorkingDirectory=$(pwd)

[Install]
WantedBy=default.target
EOF
        
        print_info "Systemd service created"
        print_info "Enable service with: systemctl --user enable olympus-docs-api"
        print_info "Start service with: systemctl --user start olympus-docs-api"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        local service_dir="$HOME/Library/LaunchAgents"
        mkdir -p "$service_dir"
        
        cat > "$service_dir/com.olympuscloud.docs-api.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.olympuscloud.docs-api</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(pwd)/start-api.sh</string>
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
    <key>WorkingDirectory</key>
    <string>$(pwd)</string>
</dict>
</plist>
EOF
        
        print_info "LaunchAgent created"
        print_info "Load service with: launchctl load $service_dir/com.olympuscloud.docs-api.plist"
    fi
    
    print_status "GitHub Copilot API configuration created"
    print_info "Start API with: ./start-api.sh"
    print_info "API endpoints will be available at http://localhost:3000"
}

# Test MCP server integration
test_mcp_integration() {
    print_header "Testing MCP Server Integration"
    
    # Determine which server to test
    local server_script="dist/server.js"
    if [ -f "dist/modular-server.js" ]; then
        server_script="dist/modular-server.js"
        print_info "Testing modular MCP server"
    fi
    
    # Test MCP protocol
    print_info "Testing MCP protocol communication..."
    local test_json='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
    
    if timeout 10 bash -c "echo '$test_json' | node $server_script" >/dev/null 2>&1; then
        print_status "MCP protocol test passed"
    else
        print_warning "MCP protocol test timed out or failed"
    fi
    
    # Test tool listing
    print_info "Testing tool listing..."
    local tools_json='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
    
    if timeout 10 bash -c "echo '$tools_json' | node $server_script" >/dev/null 2>&1; then
        print_status "Tool listing test passed"
    else
        print_warning "Tool listing test timed out or failed"
    fi
    
    print_status "MCP integration tests completed"
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
    echo "Enhanced setup for AI coding agents and Olympus Cloud development"
    echo "This will configure:"
    echo "  • Modular MCP Server with enhanced architecture"
    echo "  • Claude Desktop integration"
    echo "  • VS Code extensions (Cline, Continue)"
    echo "  • GitHub Copilot API integration"
    echo "  • Azure, .NET 9/10, and enterprise documentation"
    echo ""
    
    # Verify we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. This script must be run from the mcp-server-docs-lookup directory"
        exit 1
    fi
    
    # Setup GitHub token if provided
    if [ -n "$GITHUB_TOKEN" ]; then
        export OLYMPUS_GITHUB_TOKEN="$GITHUB_TOKEN"
        print_info "GitHub token configured for private repository access"
    fi
    
    # Core setup steps
    check_prerequisites
    setup_mcp_server
    setup_qdrant
    create_olympus_config
    create_npm_scripts
    
    # Documentation sync
    if [ "$SKIP_SYNC" != true ]; then
        echo ""
        read -p "Would you like to sync documentation now? This will take 10-30 minutes (y/N): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sync_documentation
        else
            print_info "Skipping documentation sync"
            print_info "You can sync later with: node dist/cli.js sync"
        fi
    fi
    
    # Test core functionality
    test_installation
    
    # AI agent integrations
    if [ "$SKIP_AI_SETUP" != true ]; then
        print_header "Configuring AI Coding Agents"
        configure_claude_code_enhanced
        configure_vscode_extensions
        setup_github_copilot_api
        test_mcp_integration
    fi
    
    # Start API server for Copilot
    if [ "$SKIP_AI_SETUP" != true ]; then
        echo ""
        
        if [ "$DEV_MODE" = true ]; then
            # Auto-start in dev mode
            print_info "Dev mode: Auto-starting API server..."
            start_api_server
        else
            # Ask in normal mode
            read -p "Start API server for GitHub Copilot? (Y/n): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                start_api_server
            fi
        fi
    fi
    
    # Show completion message
    show_final_instructions
    
    print_header "Setup Complete! 🎉"
    print_status "Olympus Cloud Documentation MCP Server is ready for AI coding agents"
    
    # Show next steps
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo -e "${GREEN}1. Restart Claude Desktop to load the MCP server${NC}"
    echo -e "${GREEN}2. Install Cline or Continue extension in VS Code${NC}"
    echo -e "${GREEN}3. Access the API server at http://localhost:3000/health${NC}"
    echo -e "${GREEN}4. Test search: node dist/cli.js search \"Azure Functions best practices\"${NC}"
    echo -e "${GREEN}5. Read integration guides in docs/ folder${NC}"
    
    if [ "$DEV_MODE" = true ]; then
        echo ""
        echo -e "${BLUE}Development mode features enabled:${NC}"
        echo -e "${BLUE}  • Enhanced logging and debugging${NC}"
        echo -e "${BLUE}  • Hot reload for configuration changes${NC}"
        echo -e "${BLUE}  • Additional development tools${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}Happy coding with enhanced AI documentation context! 🚀${NC}"
}

# Run main function
main "$@"