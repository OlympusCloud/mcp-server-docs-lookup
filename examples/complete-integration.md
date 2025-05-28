# Complete Integration Example

This guide demonstrates how to use all features of the Universal Documentation MCP Server together.

## 1. Initial Setup

### Start Services

```bash
# Start Qdrant vector database
docker-compose up -d qdrant

# Initialize with Olympus Cloud preset
universal-doc-mcp init olympus-cloud

# Add your custom repositories
universal-doc-mcp add-repo https://github.com/yourorg/hub-docs.git \
  --name hub-docs \
  --priority high \
  --category architecture

# Initial sync
universal-doc-mcp sync
```

### Start Servers

```bash
# Start both MCP and API servers
universal-doc-mcp start --mode both
```

## 2. Claude Code Integration

Configure Claude Code to use the MCP server:

```json
{
  "mcpServers": {
    "universal-docs": {
      "command": "universal-doc-mcp",
      "args": ["start"],
      "env": {
        "EMBEDDING_PROVIDER": "local",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## 3. Using Advanced Features

### Progressive Context Disclosure

```typescript
// In Claude, ask for progressive context
"Show me how to implement user authentication with progressive detail"

// The system will provide:
// 1. Overview - High-level concepts
// 2. Details - Specific implementation steps
// 3. Related - Additional resources
```

### Olympus Cloud Hub Implementation

```bash
# Generate hub implementation context via API
curl -X POST http://localhost:3000/api/olympus/hub-implementation \
  -H "Content-Type: application/json" \
  -d '{
    "hubType": "UserManagement",
    "functionality": "multi-tenant authentication",
    "includeArchitecture": true,
    "includeApiSpecs": true,
    "includeExamples": true,
    "includeDeployment": true,
    "includeTesting": true
  }'
```

### Cross-Hub Integration

```bash
# Get cross-hub integration patterns
curl -X POST http://localhost:3000/api/olympus/cross-hub \
  -H "Content-Type: application/json" \
  -d '{
    "sourceHub": "UserManagement",
    "targetHub": "BillingHub",
    "integrationType": "all",
    "includeSecurityPatterns": true,
    "includeMonitoring": true
  }'
```

## 4. Real-time Updates

### WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  // Subscribe to specific repositories
  ws.send(JSON.stringify({
    type: 'subscribe',
    data: {
      repositories: ['hub-docs', 'api-standards']
    }
  }));
});

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log(`Event: ${event.type}`, event.data);
});
```

### Webhook Configuration

Configure your GitHub repository to send webhooks:

```
Webhook URL: https://your-server.com/api/webhooks/github
Content Type: application/json
Secret: your-webhook-secret
Events: Push events
```

## 5. Custom Templates

### Create a Custom Template

```bash
curl -X POST http://localhost:3000/api/context/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "hub-implementation",
    "format": "markdown",
    "template": "# Hub Implementation Guide: {{query}}\n\n## Total Results: {{total}}\n\n{{#results}}\n### {{repository}} - {{filepath}}\nScore: {{score}}\n\n{{content}}\n\n---\n{{/results}}"
  }'
```

### Use the Template

```bash
curl -X POST http://localhost:3000/api/context/generate-templated \
  -H "Content-Type: application/json" \
  -d '{
    "task": "implement user authentication",
    "template": "hub-implementation"
  }'
```

## 6. Plugin System

### Create a Custom Plugin

```typescript
// plugins/olympus-enhancer.ts
import { Plugin } from '../src/plugins/plugin-manager';

export default {
  name: 'olympus-enhancer',
  version: '1.0.0',
  
  contextGenerators: [{
    name: 'olympus-boost',
    strategies: ['hybrid'],
    
    async generate(query, chunks) {
      // Boost Olympus-specific content
      return chunks.map(chunk => {
        if (chunk.repository.includes('olympus') || 
            chunk.metadata.category === 'hub') {
          chunk.score *= 1.3;
          chunk.relevanceExplanation += '; Olympus Cloud optimized';
        }
        return chunk;
      });
    }
  }]
};
```

### Load the Plugin

Place the plugin in the `plugins/` directory and restart the server.

## 7. Advanced Search Strategies

### Semantic Search with Filters

```typescript
// Search for specific patterns in Olympus architecture
const searchParams = {
  task: "microservice communication patterns",
  language: "typescript",
  framework: "express",
  repositories: ["olympus-architecture"],
  categories: ["patterns", "integration"],
  maxResults: 30
};

// Via API
const response = await fetch('/api/context/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(searchParams)
});
```

### Hybrid Search Strategy

The system automatically selects the best search strategy:
- **Semantic**: For conceptual queries ("how to", "explain", "overview")
- **Keyword**: For specific code patterns or API names
- **Hybrid**: Combines both for comprehensive results

## 8. Monitoring and Metrics

### Check System Status

```bash
# Repository status
curl http://localhost:3000/api/repos/status

# Search statistics
curl http://localhost:3000/api/search/stats

# WebSocket connections
curl http://localhost:3000/health
```

### Monitor Sync Progress

```javascript
// Subscribe to sync events
ws.send(JSON.stringify({
  type: 'subscribe',
  data: { repositories: ['*'] } // All repositories
}));

// Receive progress updates
ws.on('message', (data) => {
  const event = JSON.parse(data);
  if (event.type === 'sync:progress') {
    console.log(`${event.data.repository}: ${event.data.progress}%`);
  }
});
```

## 9. Best Practices

### Repository Configuration

```json
{
  "repositories": [
    {
      "name": "critical-docs",
      "url": "https://github.com/org/critical.git",
      "priority": "high",
      "syncInterval": 30,
      "paths": ["/docs", "/api"],
      "exclude": ["*/archived/*", "*/deprecated/*"]
    }
  ]
}
```

### Performance Optimization

1. **Chunking Strategy**:
   ```json
   {
     "chunkingStrategy": {
       "maxChunkSize": 1500,
       "overlapSize": 200,
       "respectBoundaries": true
     }
   }
   ```

2. **Embedding Cache**:
   - Local embeddings are cached automatically
   - Cloud embeddings cached for 24 hours

3. **Selective Indexing**:
   - Use `paths` to index only relevant directories
   - Use `exclude` patterns to skip unnecessary files

### Security

1. **Authentication**:
   ```bash
   # Use environment variables for sensitive data
   export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
   export OPENAI_API_KEY=sk-xxxxxxxxxxxx
   ```

2. **Webhook Security**:
   ```bash
   export GITHUB_WEBHOOK_SECRET=your-secret
   export GITLAB_WEBHOOK_TOKEN=your-token
   ```

3. **API Access Control**:
   - Implement authentication middleware
   - Use rate limiting for public endpoints
   - Enable CORS only for trusted origins

## 10. Troubleshooting

### Common Issues

1. **Embeddings Not Generated**:
   ```bash
   # Check embedding service logs
   docker logs mcp-server-api-server-1 | grep embedding
   
   # Verify model is downloaded
   ls -la models/
   ```

2. **Search Returns No Results**:
   ```bash
   # Check if documents are indexed
   curl http://localhost:3000/api/search/stats
   
   # Force re-sync
   universal-doc-mcp sync --force
   ```

3. **WebSocket Connection Drops**:
   - Check firewall rules
   - Verify nginx/proxy WebSocket support
   - Enable ping/pong keepalive

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=debug
universal-doc-mcp start

# View detailed sync logs
tail -f logs/sync.log
```

## Complete Example Workflow

1. **Setup Project Documentation**:
   ```bash
   universal-doc-mcp init olympus-cloud
   universal-doc-mcp add-repo https://github.com/org/hub-templates.git
   universal-doc-mcp sync
   ```

2. **Implement New Hub**:
   ```bash
   # Get implementation guide
   curl -X POST http://localhost:3000/api/olympus/hub-implementation \
     -d '{"hubType": "Analytics", "functionality": "real-time metrics"}'
   ```

3. **Integrate with Existing Hub**:
   ```bash
   # Get integration patterns
   curl -X POST http://localhost:3000/api/olympus/cross-hub \
     -d '{"sourceHub": "Analytics", "targetHub": "UserManagement", "integrationType": "event"}'
   ```

4. **Monitor Progress**:
   - Connect WebSocket for real-time updates
   - Set up webhooks for automatic syncing
   - Check metrics dashboard

This comprehensive setup provides intelligent, context-aware documentation support for your entire development workflow.