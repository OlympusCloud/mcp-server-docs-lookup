#!/bin/bash

# Universal MCP Server Deployment Script

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_ENV="${DEPLOY_ENV:-production}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-docker.io}"
DOCKER_USERNAME="${DOCKER_USERNAME}"
VERSION="${VERSION:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

check_requirements() {
    log_info "Checking requirements..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check environment variables
    if [[ -z "$DOCKER_USERNAME" ]]; then
        log_error "DOCKER_USERNAME is not set"
        exit 1
    fi
    
    # Check if .env file exists
    if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        log_warn ".env file not found. Running auth generator..."
        cd "$PROJECT_ROOT"
        npm run generate:auth
    fi
    
    log_info "Requirements check passed"
}

build_docker_image() {
    log_info "Building Docker image..."
    
    cd "$PROJECT_ROOT"
    
    # Build the image
    docker build \
        -t "${DOCKER_REGISTRY}/${DOCKER_USERNAME}/mcp-server-docs:${VERSION}" \
        -t "${DOCKER_REGISTRY}/${DOCKER_USERNAME}/mcp-server-docs:latest" \
        .
    
    log_info "Docker image built successfully"
}

push_docker_image() {
    log_info "Pushing Docker image to registry..."
    
    docker push "${DOCKER_REGISTRY}/${DOCKER_USERNAME}/mcp-server-docs:${VERSION}"
    docker push "${DOCKER_REGISTRY}/${DOCKER_USERNAME}/mcp-server-docs:latest"
    
    log_info "Docker image pushed successfully"
}

deploy_docker_compose() {
    log_info "Deploying with Docker Compose..."
    
    cd "$PROJECT_ROOT/deploy"
    
    # Create necessary directories
    mkdir -p config data logs nginx/logs prometheus grafana/provisioning
    
    # Copy configuration files
    cp "$PROJECT_ROOT/config/config.yaml" config/
    
    # Load environment variables
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
    
    # Deploy with docker-compose
    docker-compose -f docker-compose.prod.yml up -d
    
    log_info "Docker Compose deployment completed"
}

deploy_kubernetes() {
    log_info "Deploying to Kubernetes..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    cd "$PROJECT_ROOT/deploy/k8s"
    
    # Create namespace
    kubectl create namespace mcp-system --dry-run=client -o yaml | kubectl apply -f -
    
    # Update image in deployment
    sed -i "s|image: .*mcp-server-docs:.*|image: ${DOCKER_REGISTRY}/${DOCKER_USERNAME}/mcp-server-docs:${VERSION}|g" deployment.yaml
    
    # Apply configurations
    kubectl apply -f deployment.yaml
    kubectl apply -f ingress.yaml
    
    # Wait for deployment
    kubectl rollout status deployment/mcp-server-docs -n mcp-system
    
    log_info "Kubernetes deployment completed"
}

deploy_health_check() {
    log_info "Running health check..."
    
    if [[ "$DEPLOY_ENV" == "docker" ]]; then
        # Docker health check
        sleep 10
        if curl -f http://localhost:3000/health > /dev/null 2>&1; then
            log_info "Health check passed"
        else
            log_error "Health check failed"
            exit 1
        fi
    elif [[ "$DEPLOY_ENV" == "kubernetes" ]]; then
        # Kubernetes health check
        kubectl wait --for=condition=ready pod -l app=mcp-server-docs -n mcp-system --timeout=300s
        log_info "All pods are ready"
    fi
}

show_deployment_info() {
    log_info "Deployment Summary:"
    echo "===================="
    echo "Environment: $DEPLOY_ENV"
    echo "Version: $VERSION"
    echo "Registry: $DOCKER_REGISTRY"
    
    if [[ "$DEPLOY_ENV" == "docker" ]]; then
        echo ""
        echo "Services:"
        docker-compose -f "$PROJECT_ROOT/deploy/docker-compose.prod.yml" ps
        echo ""
        echo "Access URLs:"
        echo "- API: http://localhost:3000"
        echo "- Qdrant: http://localhost:6333"
        echo "- Prometheus: http://localhost:9090"
        echo "- Grafana: http://localhost:3001"
    elif [[ "$DEPLOY_ENV" == "kubernetes" ]]; then
        echo ""
        echo "Pods:"
        kubectl get pods -n mcp-system
        echo ""
        echo "Services:"
        kubectl get services -n mcp-system
        echo ""
        echo "Ingress:"
        kubectl get ingress -n mcp-system
    fi
}

# Main deployment flow
main() {
    log_info "Starting MCP Server deployment..."
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                DEPLOY_ENV="$2"
                shift 2
                ;;
            --version)
                VERSION="$2"
                shift 2
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-push)
                SKIP_PUSH=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Validate environment
    if [[ "$DEPLOY_ENV" != "docker" && "$DEPLOY_ENV" != "kubernetes" && "$DEPLOY_ENV" != "production" ]]; then
        log_error "Invalid deployment environment: $DEPLOY_ENV"
        log_error "Valid options: docker, kubernetes, production"
        exit 1
    fi
    
    # Check requirements
    check_requirements
    
    # Build and push image
    if [[ "$SKIP_BUILD" != "true" ]]; then
        build_docker_image
    fi
    
    if [[ "$SKIP_PUSH" != "true" && "$DEPLOY_ENV" != "docker" ]]; then
        push_docker_image
    fi
    
    # Deploy based on environment
    case $DEPLOY_ENV in
        docker|production)
            deploy_docker_compose
            ;;
        kubernetes)
            deploy_kubernetes
            ;;
    esac
    
    # Health check
    deploy_health_check
    
    # Show deployment info
    show_deployment_info
    
    log_info "Deployment completed successfully!"
}

# Run main function
main "$@"