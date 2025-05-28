#!/bin/bash

# Universal MCP Server Setup Script

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

check_node_version() {
    log_step "Checking Node.js version..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        log_error "Please install Node.js 18 or higher"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"
    
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
        log_error "Node.js version $NODE_VERSION is too old"
        log_error "Please upgrade to Node.js 18 or higher"
        exit 1
    fi
    
    log_info "Node.js version $NODE_VERSION is compatible"
}

install_dependencies() {
    log_step "Installing dependencies..."
    
    cd "$PROJECT_ROOT"
    npm install
    
    log_info "Dependencies installed successfully"
}

create_directories() {
    log_step "Creating necessary directories..."
    
    mkdir -p "$PROJECT_ROOT"/{data,logs,config/presets}
    mkdir -p "$PROJECT_ROOT"/deploy/{nginx,prometheus,grafana/provisioning}
    mkdir -p "$PROJECT_ROOT"/.github/workflows
    
    log_info "Directories created"
}

setup_configuration() {
    log_step "Setting up configuration..."
    
    # Check if config exists
    if [[ ! -f "$PROJECT_ROOT/config/config.yaml" ]]; then
        log_info "Creating default configuration..."
        
        cat > "$PROJECT_ROOT/config/config.yaml" << 'EOF'
project:
  name: "Universal Documentation MCP Server"
  description: "AI-powered documentation search and context generation"
  version: "1.0.0"

server:
  port: 3000
  host: "localhost"

vectorStore:
  type: "qdrant"
  config:
    url: "http://localhost:6333"
    collection: "documentation"

repositories: []

contextGeneration:
  maxTokens: 8000
  minRelevanceScore: 0.7
  includeMetadata: true
  progressive:
    enabled: true
    levels:
      - name: "overview"
        maxChunks: 3
      - name: "detailed"
        maxChunks: 10
      - name: "comprehensive"
        maxChunks: 25
EOF
        
        log_info "Default configuration created"
    else
        log_info "Configuration already exists"
    fi
}

generate_auth_config() {
    log_step "Generating authentication configuration..."
    
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        log_warn ".env file already exists. Skipping auth generation."
        log_warn "To regenerate, delete .env and run: node dist/utils/auth-generator.js"
    else
        cd "$PROJECT_ROOT"
        # Run the auth generator directly
        if [[ -f "$PROJECT_ROOT/dist/utils/auth-generator.js" ]]; then
            node "$PROJECT_ROOT/dist/utils/auth-generator.js"
            log_info "Authentication configuration generated"
        else
            log_warn "Auth generator not found. Creating basic .env file..."
            cat > "$PROJECT_ROOT/.env" << 'EOF'
# Universal MCP Server Environment Configuration
NODE_ENV=production
LOG_LEVEL=info

# API Server (optional)
API_PORT=3000
API_HOST=localhost

# Authentication (auto-generated)
API_KEY=
ADMIN_TOKEN=

# GitHub Access (for private repos)
GITHUB_TOKEN=

# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379
EOF
            log_info "Basic .env file created. Run 'node dist/utils/auth-generator.js' to generate tokens"
        fi
    fi
}

setup_docker_services() {
    log_step "Setting up Docker services..."
    
    if ! command -v docker &> /dev/null; then
        log_warn "Docker is not installed. Skipping Docker setup."
        log_warn "To use Docker services, install Docker and run: docker-compose up -d"
        return
    fi
    
    cd "$PROJECT_ROOT"
    
    # Ask user if they want to start services
    read -p "Do you want to start Docker services (Qdrant, Redis)? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose up -d qdrant redis
        log_info "Docker services started"
        log_info "Qdrant UI: http://localhost:6333"
        log_info "Redis: localhost:6379"
    else
        log_info "Docker services not started. Run 'docker-compose up -d' when ready."
    fi
}

build_project() {
    log_step "Building TypeScript project..."
    
    cd "$PROJECT_ROOT"
    npm run build
    
    log_info "Project built successfully"
}

setup_presets() {
    log_step "Setting up repository presets..."
    
    # Check if presets are already created
    if [[ -z "$(ls -A $PROJECT_ROOT/config/presets/)" ]]; then
        log_warn "No presets found. Run the server to initialize default presets."
    else
        log_info "Presets already configured"
    fi
}

print_next_steps() {
    echo
    echo -e "${GREEN}✅ Setup completed successfully!${NC}"
    echo
    echo "Next steps:"
    echo "1. Review and update config/config.yaml"
    echo "2. Apply a preset: npm run cli apply-preset <preset-name>"
    echo "3. Start the MCP server: npm start"
    echo "4. Start the API server: npm run api"
    echo
    echo "Available presets:"
    echo "- general-web: General web development documentation"
    echo "- dotnet-azure: .NET and Azure documentation"
    echo "- owasp-security: OWASP security documentation"
    echo "- ai-ml: AI/ML documentation"
    echo "- data-engineering: Data engineering documentation"
    echo "- olympus-cloud: Olympus Cloud documentation"
    echo
    echo "For VS Code integration:"
    echo "1. Install the extension from vscode-extension/"
    echo "2. Configure Claude Code or GitHub Copilot settings"
    echo
    echo "Documentation: https://github.com/your-org/mcp-server-docs"
}

# Main setup flow
main() {
    log_info "Starting Universal MCP Server setup..."
    echo
    
    # Run setup steps
    check_node_version
    create_directories
    install_dependencies
    setup_configuration
    generate_auth_config
    build_project
    setup_docker_services
    setup_presets
    
    # Print completion message
    print_next_steps
}

# Run main function
main "$@"