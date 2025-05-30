# Troubleshooting Guide

This comprehensive guide addresses common issues with the MCP Server Docs Lookup and provides solutions for a smooth experience.

## Table of Contents

1. [Connection Issues](#connection-issues)
2. [Embedding Issues](#embedding-issues)
3. [Repository Synchronization Issues](#repository-synchronization-issues)
4. [API Server Issues](#api-server-issues)
5. [Qdrant Vector Database Issues](#qdrant-vector-database-issues)
6. [Claude Integration Issues](#claude-integration-issues)
7. [GitHub Copilot Integration Issues](#github-copilot-integration-issues)
8. [VS Code Integration Issues](#vs-code-integration-issues)

## Connection Issues

### "Connection closed" errors

**Symptom**: AI assistants like Claude or GitHub Copilot report "Connection closed" errors when trying to access documentation.

**Solution**:

1. Check if the API server is running:
   ```bash
   curl http://localhost:3001/health
   ```

2. Restart the API server:
   ```bash
   pkill -f api-server
   npm run api
   ```

3. If problems persist, run the complete diagnostic and repair tool:
   ```bash
   ./tools/fix-embeddings.sh --fix-all
   ```

### Connection timeouts

**Symptom**: Long delays followed by timeout errors when querying documentation.

**Solution**:

1. Check if the vector search is taking too long:
   ```bash
   curl "http://localhost:3001/search?q=test&limit=5"
   ```

2. Optimize vector search by reducing the collection size or increasing server resources:
   ```bash
   npm run optimize-vectors
   ```

3. Adjust the timeout settings in your AI assistant configuration.

## Embedding Issues

### Missing vector embeddings

**Symptom**: Search queries return no results even though documents are present, or health check shows documents but no chunks.

**Solution**:

1. Check the embedding provider configuration:
   ```json
   // In config/config.json
   "embedding": {
     "provider": "local",  // Should be "local"
     "model": "Xenova/all-MiniLM-L6-v2",
     "dimensions": 384
   }
   ```

2. Rebuild all vector embeddings:
   ```bash
   node tools/rebuild-embeddings.js
   ```

3. Verify embeddings were created:
   ```bash
   curl http://localhost:3001/health | jq
   ```

### Incorrect embedding dimensions

**Symptom**: Errors about vector dimensions not matching when searching or adding documents.

**Solution**:

1. Check the dimension configuration in config.json and ensure it matches your model:
   ```json
   "dimensions": 384  // Must match the dimensions of your embedding model
   ```

2. Rebuild embeddings with the correct dimensions:
   ```bash
   ./tools/fix-embeddings.sh --rebuild
   ```

## Repository Synchronization Issues

### Repositories not syncing

**Symptom**: New documents or updates not appearing in search results.

**Solution**:

1. Manually trigger a sync:
   ```bash
   npm run sync
   ```

2. Check if repositories are correctly configured in config.json:
   ```json
   "repositories": [
     {
       "name": "repo-name",
       "url": "https://github.com/org/repo.git",
       "branch": "main",
       "paths": ["/docs", "/README.md"],
       "syncInterval": 60
     }
   ]
   ```

3. Check synchronization logs:
   ```bash
   cat logs/combined.log | grep sync
   ```

### Authentication issues with repositories

**Symptom**: Failed to clone or pull repositories due to authentication errors.

**Solution**:

1. Check if repositories use the correct authentication method:
   ```json
   "authType": "ssh" // or "token", "basic", "none"
   ```

2. For SSH authentication, ensure your SSH keys are set up:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

3. For token authentication, ensure your token is correct and has the necessary permissions.

## API Server Issues

### API server crashing

**Symptom**: API server stops responding or crashes with out-of-memory errors.

**Solution**:

1. Increase Node.js memory limit:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

2. Check for memory leaks in logs:
   ```bash
   cat logs/error.log | grep memory
   ```

3. Restart with enhanced garbage collection:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096 --expose-gc" npm run api
   ```

### API rate limiting issues

**Symptom**: Receiving 429 Too Many Requests responses.

**Solution**:

1. Adjust rate limits in configuration:
   ```json
   "rateLimiting": {
     "search": {
       "points": 60,
       "duration": 60000
     }
   }
   ```

2. Implement backoff strategies in API clients.

## Qdrant Vector Database Issues

### Qdrant not running or not accessible

**Symptom**: Cannot connect to Qdrant on localhost:6333.

**Solution**:

1. Start Qdrant using Docker:
   ```bash
   docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant
   ```

2. Check if Qdrant is running:
   ```bash
   curl http://localhost:6333/health
   ```

3. Use docker-compose for a complete setup:
   ```bash
   docker-compose up -d qdrant
   ```

### Collection issues

**Symptom**: Collection not found or corrupted vectors.

**Solution**:

1. Recreate the collection:
   ```bash
   node tools/rebuild-embeddings.js
   ```

2. Check collection details:
   ```bash
   curl http://localhost:6333/collections/documentation | jq
   ```

3. Optimize the collection:
   ```bash
   curl -X POST http://localhost:6333/collections/documentation/optimize
   ```

## Claude Integration Issues

### Claude not receiving context

**Symptom**: Claude doesn't have access to relevant documentation in responses.

**Solution**:

1. Ensure Claude is configured to use the MCP server:
   ```json
   // In Claude Desktop config
   "mcp": {
     "enabled": true,
     "url": "http://localhost:3000"
   }
   ```

2. Check Claude logs for MCP-related messages:
   ```
   [MCP] Connected to MCP server at http://localhost:3000
   ```

3. Test MCP server with Claude-specific endpoint:
   ```bash
   curl http://localhost:3001/claude-test
   ```

### Claude displaying incorrect context

**Symptom**: Claude retrieves irrelevant documentation for queries.

**Solution**:

1. Improve document chunking and metadata:
   ```bash
   npm run optimize-chunks
   ```

2. Adjust context retrieval settings:
   ```json
   "contextGeneration": {
     "maxContextLength": 4000,
     "scoreThreshold": 0.7
   }
   ```

## GitHub Copilot Integration Issues

### Copilot not using MCP context

**Symptom**: GitHub Copilot doesn't incorporate documentation from MCP server.

**Solution**:

1. Ensure Copilot extension is configured correctly:
   ```json
   // In VS Code settings.json
   "github.copilot.advanced": {
     "language.model.api.endpoint": "http://localhost:3001/copilot/"
   }
   ```

2. Test API endpoint for Copilot:
   ```bash
   curl http://localhost:3001/copilot/health
   ```

3. Restart VS Code to apply changes.

### Copilot errors with MCP integration

**Symptom**: Errors in VS Code when Copilot tries to use MCP integration.

**Solution**:

1. Check API logs for Copilot requests:
   ```bash
   cat logs/combined.log | grep copilot
   ```

2. Verify CORS settings:
   ```json
   "cors": {
     "enabled": true,
     "origins": ["vscode://*"]
   }
   ```

## VS Code Integration Issues

### VS Code extension connectivity

**Symptom**: VS Code extensions can't connect to the MCP server.

**Solution**:

1. Check VS Code extension settings:
   ```json
   "mcpServer.url": "http://localhost:3001"
   ```

2. Ensure the API server allows VS Code connections:
   ```json
   "cors": {
     "enabled": true,
     "origins": ["vscode://*"]
   }
   ```

3. Test connection from VS Code:
   ```
   > MCP: Test Connection
   ```

### VS Code displaying wrong documentation

**Symptom**: VS Code extensions show incorrect or outdated documentation.

**Solution**:

1. Sync repositories to get latest content:
   ```bash
   npm run sync
   ```

2. Clear VS Code extension cache:
   ```
   > MCP: Clear Cache
   ```

3. Restart VS Code extension host:
   ```
   > Developer: Restart Extension Host
   ```
