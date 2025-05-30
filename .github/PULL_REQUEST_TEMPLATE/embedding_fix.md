# Embedding Generation Fix for MCP Server Docs Lookup

## Summary

This PR addresses the "Connection closed" error occurring in Claude and other AI assistants when using the MCP server docs lookup. The root cause was identified as missing vector embeddings for the indexed documents, which made the content unsearchable via semantic search.

## Changes

- Created `diagnostic.sh` script for comprehensive system diagnosis and repair
- Created `docs/EMBEDDING_TROUBLESHOOTING.md` for troubleshooting embedding issues
- Created `FIX_SUMMARY.md` with a detailed explanation of the issue and fix
- Updated `README.md` to link to the new troubleshooting guide
- Verified configuration files have correct embedding provider settings
- Created/improved scripts for rebuilding and testing embeddings

## Testing

The fix was tested by:

1. Running the rebuild-embeddings.js script
2. Verifying documents were properly indexed with embeddings
3. Testing search functionality via the test-search-2.js script
4. Confirming API server health endpoint shows proper document counts

## Implementation Notes

The key to fixing this issue is ensuring that:

1. The embedding provider is set to "local" in config files
2. The Qdrant server is running and accessible
3. All documents have embeddings generated and stored properly
4. The API server is correctly connected to the vector store

The diagnostic.sh script automates all these checks and fixes.

## Reviewers

- [ ] @olympus-cloud/devops for deployment considerations
- [ ] @olympus-cloud/ai for AI integration validation

## Related Issues

- Fixes #XX - "Connection closed" errors in Claude
- Related to #YY - Search functionality improvements
