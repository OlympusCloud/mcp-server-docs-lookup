#!/bin/bash

# ================================================================
# MCP Server Docs Lookup - Embedding Tool
# ================================================================
# Comprehensive tool for diagnosing and fixing embedding issues
# ----------------------------------------------------------------

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}📝 MCP Server Docs Lookup - Embeddings Tool${NC}"
echo -e "${BLUE}====================================================${NC}"

# Function to check and report status
check_status() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ $1${NC}"
    return 0
  else
    echo -e "${RED}❌ $1${NC}"
    return 1
  fi
}

# Function to print section header
section() {
  echo -e "\n${BLUE}📋 $1${NC}"
  echo -e "${BLUE}--------------------------------------------------${NC}"
}

# Show help menu
show_help() {
  echo -e "Usage: $0 [options]"
  echo -e ""
  echo -e "Options:"
  echo -e "  --diagnose     Run a full system diagnosis without making changes"
  echo -e "  --rebuild      Rebuild all embeddings"
  echo -e "  --test         Run embedding search test"
  echo -e "  --fix-all      Complete diagnosis and fix (default)"
  echo -e "  --help         Show this help menu"
  echo -e ""
  exit 0
}

# Parse arguments
ACTION="fix-all"
if [ $# -gt 0 ]; then
  case "$1" in
    --diagnose)
      ACTION="diagnose"
      ;;
    --rebuild)
      ACTION="rebuild"
      ;;
    --test)
      ACTION="test"
      ;;
    --fix-all)
      ACTION="fix-all"
      ;;
    --help)
      show_help
      ;;
    *)
      echo -e "${RED}Invalid option: $1${NC}"
      show_help
      ;;
  esac
fi

# Check environment
check_environment() {
  section "Checking Environment"

  echo -n "Checking Node.js version: "
  node_version=$(node -v 2>/dev/null)
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ $node_version${NC}"
  else
    echo -e "${RED}❌ Node.js not found${NC}"
    echo -e "${YELLOW}⚠️  Please install Node.js v18 or later${NC}"
    exit 1
  fi

  echo -n "Checking npm version: "
  npm_version=$(npm -v 2>/dev/null)
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ $npm_version${NC}"
  else
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
  fi

  echo -n "Checking for required directories: "
  if [ -d "./src" ] && [ -d "./dist" ] && [ -d "./config" ]; then
    echo -e "${GREEN}✅ Core directories found${NC}"
  else
    echo -e "${RED}❌ Missing essential directories${NC}"
    echo -e "${YELLOW}⚠️  Please run from the project root directory${NC}"
    exit 1
  fi
}

# Check configurations
check_config() {
  section "Checking Configurations"

  echo -n "Checking config.json: "
  if [ -f "./config/config.json" ]; then
    echo -e "${GREEN}✅ Found${NC}"
    
    # Verify embedding provider setting
    embedding_provider=$(grep -o '"provider":\s*"[^"]*"' ./config/config.json | grep -o '"[^"]*"$' | tr -d '"')
    
    if [ "$embedding_provider" == "local" ]; then
      echo -e "${GREEN}✅ Embedding provider correctly set to 'local'${NC}"
    else
      echo -e "${RED}❌ Embedding provider set to '$embedding_provider'${NC}"
      
      if [ "$ACTION" == "diagnose" ]; then
        echo -e "${YELLOW}⚠️  Config should be updated to use 'local' embedding provider${NC}"
      else
        echo -e "${YELLOW}⚠️  Fixing config.json to use 'local' embedding provider...${NC}"
        
        # Create a backup
        cp ./config/config.json ./config/config.json.bak
        
        # Update the config
        sed -i '' 's/"provider":\s*"[^"]*"/"provider": "local"/g' ./config/config.json
        check_status "Updated config.json"
      fi
    fi
  else
    echo -e "${RED}❌ config.json not found${NC}"
    echo -e "${YELLOW}⚠️  Please copy config.example.json to config.json${NC}"
  fi
}

# Check Qdrant
check_qdrant() {
  section "Checking Qdrant Vector Database"

  echo -n "Checking if Qdrant is running: "
  qdrant_health=$(curl -s http://localhost:6333/health 2>/dev/null)

  if [ $? -eq 0 ] && [ ! -z "$qdrant_health" ]; then
    echo -e "${GREEN}✅ Qdrant is running${NC}"
    
    echo -n "Checking for 'documentation' collection: "
    collection_info=$(curl -s http://localhost:6333/collections/documentation 2>/dev/null)
    
    if [[ $collection_info == *"status"* && $collection_info == *"error"* ]]; then
      echo -e "${YELLOW}⚠️  Documentation collection not found${NC}"
      echo -e "${YELLOW}⚠️  Will create during rebuild${NC}"
    else
      echo -e "${GREEN}✅ Collection exists${NC}"
      
      # Display collection stats
      points_count=$(echo $collection_info | grep -o '"vectors_count":[0-9]*' | grep -o '[0-9]*')
      indexed_count=$(echo $collection_info | grep -o '"indexed_vectors_count":[0-9]*' | grep -o '[0-9]*')
      
      echo -e "    - Points count: $points_count"
      echo -e "    - Indexed vectors: $indexed_count"
      
      if [ "$points_count" == "0" ]; then
        echo -e "${YELLOW}⚠️  No vectors found in the collection${NC}"
      fi
    fi
  else
    echo -e "${RED}❌ Qdrant is not running${NC}"
    echo -e "${YELLOW}⚠️  Please start Qdrant using Docker:${NC}"
    echo -e "${YELLOW}    docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant${NC}"
    echo -e "${YELLOW}    or: docker-compose up -d qdrant${NC}"
    
    if [ "$ACTION" != "diagnose" ]; then
      echo -e "\nAttempting to start Qdrant using docker-compose..."
      docker-compose up -d qdrant
      sleep 5  # Give it time to start
      
      # Check again
      qdrant_health=$(curl -s http://localhost:6333/health 2>/dev/null)
      if [ $? -eq 0 ] && [ ! -z "$qdrant_health" ]; then
        echo -e "${GREEN}✅ Successfully started Qdrant${NC}"
      else
        echo -e "${RED}❌ Failed to start Qdrant. Please start it manually.${NC}"
        exit 1
      fi
    else
      exit 1
    fi
  fi
}

# Check API server
check_api() {
  section "Checking API Server"

  echo -n "Checking if API server is running: "
  api_health=$(curl -s http://localhost:3001/health 2>/dev/null)

  if [ $? -eq 0 ] && [ ! -z "$api_health" ]; then
    echo -e "${GREEN}✅ API server is running${NC}"
    
    # Extract information from health check
    vector_status=$(echo $api_health | grep -o '"vectorStore":{[^}]*}' | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$vector_status" == "pass" ]; then
      echo -e "${GREEN}✅ Vector store connectivity check passed${NC}"
    else
      echo -e "${RED}❌ Vector store connectivity check failed${NC}"
    fi
    
    total_chunks=$(echo $api_health | grep -o '"totalChunks":[0-9]*' | grep -o '[0-9]*')
    echo -e "    - Total chunks: $total_chunks"
    
    if [ "$total_chunks" == "0" ]; then
      echo -e "${YELLOW}⚠️  No document chunks found${NC}"
    fi
  else
    echo -e "${RED}❌ API server is not running${NC}"
    
    if [ "$ACTION" == "diagnose" ]; then
      echo -e "${YELLOW}⚠️  API server should be started${NC}"
    else
      echo -e "${YELLOW}⚠️  Starting API server...${NC}"
      
      # Start the API server
      nohup npm run api > ./logs/api-server.log 2>&1 &
      sleep 3
      
      # Check if it started successfully
      api_health=$(curl -s http://localhost:3001/health 2>/dev/null)
      if [ $? -eq 0 ] && [ ! -z "$api_health" ]; then
        echo -e "${GREEN}✅ API server started successfully${NC}"
      else
        echo -e "${RED}❌ Failed to start API server${NC}"
        echo -e "${YELLOW}⚠️  Please check logs/api-server.log for errors${NC}"
      fi
    fi
  fi
}

# Rebuild embeddings
rebuild_embeddings() {
  section "Rebuilding Embeddings"

  echo -e "Starting rebuild process..."
  
  # Execute rebuild script
  node rebuild-embeddings.js
  check_status "Rebuild embeddings"
}

# Test search functionality
test_search() {
  section "Testing Search Functionality"
  
  echo -e "Running search test..."
  
  # Execute test script
  node tools/test-search.js
  check_status "Search test"
}

# Final status check
check_status_final() {
  section "Final Status Check"

  # Check API health again
  api_health=$(curl -s http://localhost:3001/health 2>/dev/null)

  if [ $? -eq 0 ] && [ ! -z "$api_health" ]; then
    vector_status=$(echo $api_health | grep -o '"vectorStore":{[^}]*}' | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    total_chunks=$(echo $api_health | grep -o '"totalChunks":[0-9]*' | grep -o '[0-9]*')
    
    if [ "$vector_status" == "pass" ] && [ "$total_chunks" != "0" ]; then
      echo -e "${GREEN}✅ All systems operational!${NC}"
      echo -e "${GREEN}✅ Document count: $(echo $api_health | grep -o '"totalDocuments":[0-9]*' | grep -o '[0-9]*')${NC}"
      echo -e "${GREEN}✅ Chunk count: $total_chunks${NC}"
    else
      echo -e "${RED}❌ System not fully operational${NC}"
      if [ "$vector_status" != "pass" ]; then
        echo -e "${RED}❌ Vector store connectivity issue${NC}"
      fi
      if [ "$total_chunks" == "0" ]; then
        echo -e "${RED}❌ No document chunks found${NC}"
      fi
    fi
  else
    echo -e "${RED}❌ API server not responding${NC}"
  fi

  echo -e "\n${BLUE}====================================================${NC}"
  echo -e "${BLUE}📝 Process Complete${NC}"
  echo -e "${BLUE}====================================================${NC}"
}

# Main execution flow based on action
check_environment

case "$ACTION" in
  "diagnose")
    check_config
    check_qdrant
    check_api
    check_status_final
    ;;
  "rebuild")
    check_config
    check_qdrant
    rebuild_embeddings
    check_status_final
    ;;
  "test")
    check_environment
    test_search
    ;;
  "fix-all")
    check_config
    check_qdrant
    check_api
    rebuild_embeddings
    test_search
    check_status_final
    ;;
esac
