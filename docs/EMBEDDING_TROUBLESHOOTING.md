# Troubleshooting Embedding Issues

If you're experiencing issues with embeddings in the MCP Server Docs Lookup, follow this guide to diagnose and fix common problems.

## Common Symptoms

- "Connection closed" errors when using Claude or GitHub Copilot
- Search not returning results even though documents are present
- Missing vectors in Qdrant collection
- Health check shows documents but with zero vectors/chunks

## Quick Fixes

### 1. Run the Diagnostic Script

```bash
./diagnostic.sh
```

This comprehensive tool will:

- Check your configuration files
- Verify Qdrant is running properly
- Test API server connectivity
- Rebuild embeddings if necessary

### 2. Manual Fix Steps

If the diagnostic script doesn't work:

1. **Check Configuration**:
   Ensure `config.json` and `minimal-config.json` have:

   ```json
   "embedding": {
     "provider": "local",
     "model": "Xenova/all-MiniLM-L6-v2",
     "dimensions": 384
   }
   ```

2. **Verify Qdrant Status**:

   ```bash
   curl http://localhost:6333/collections/documentation | jq
   ```

   Check if points_count is greater than 0.

3. **Rebuild Embeddings Manually**:

   ```bash
   node rebuild-embeddings.js
   ```

4. **Restart API Server**:

   ```bash
   pkill -f api-server
   npm run api
   ```

5. **Test Search Functionality**:

   ```bash
   node test-search-2.js
   ```

## Advanced Troubleshooting

### Qdrant Not Running

If Qdrant is not accessible (error connecting to localhost:6333):

```bash
# Start Qdrant using Docker
docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant

# Or using docker-compose
docker-compose up -d qdrant
```

### API Server Issues

If the API server isn't responding:

1. Check server logs:

   ```bash
   cat logs/error.log | tail -n 20
   ```

2. Restart with debug output:

   ```bash
   DEBUG=* npm run api
   ```

### Embedding Generation Issues

If embeddings fail to generate:

1. Check the embedding service initialization:

   ```javascript
   // Should be using LOCAL provider
   const embeddingProvider = (config as any).embedding?.provider || EmbeddingProvider.LOCAL;
   const embeddingModel = (config as any).embedding?.model || 'Xenova/all-MiniLM-L6-v2';
   ```

2. Ensure the Xenova transformers package is installed:

   ```bash
   npm install @xenova/transformers
   ```

## Verifying Fix Success

After applying fixes, check:

1. **API Health Endpoint**:

   ```bash
   curl http://localhost:3001/health | jq
   ```

   Look for non-zero values in totalChunks and totalDocuments.

2. **Search Test**:

   ```bash
   node test-search-2.js
   ```

   Should return relevant results.

3. **AI Integration Test**:
   Ask Claude or GitHub Copilot a question about your documentation to verify context retrieval.
