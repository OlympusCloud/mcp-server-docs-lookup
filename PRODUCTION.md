# Production Deployment Guide

This guide covers deploying and running the Universal Documentation MCP Server in production environments.

## Prerequisites

- Node.js 18+ 
- Docker (for Qdrant)
- 2GB+ available disk space
- 1GB+ available RAM

## Installation

### From NPM (Recommended)

```bash
npm install -g universal-doc-mcp
```

### From Source

```bash
git clone https://github.com/olympus-cloud/mcp-server-docs-lookup.git
cd mcp-server-docs-lookup
npm install
npm run build
npm link
```

## Production Setup

### 1. Start Qdrant Vector Database

```bash
# Using Docker
docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  --restart unless-stopped \
  qdrant/qdrant

# Or using Docker Compose
docker-compose up -d qdrant
```

### 2. Initialize Configuration

```bash
# Create config directory
mkdir -p config

# Initialize with a preset
universal-doc-mcp init dotnet-azure

# Or copy and customize the example
cp config/config.example.json config/config.json
```

### 3. Configure for Production

Edit `config/config.json`:

```json
{
  "project": {
    "name": "production-docs",
    "description": "Production documentation server"
  },
  "repositories": [
    {
      "name": "dotnet-docs",
      "url": "https://github.com/dotnet/docs.git",
      "branch": "main",
      "paths": ["/docs"],
      "syncInterval": 1440,  // Daily sync
      "priority": "high"
    }
  ],
  "contextGeneration": {
    "strategies": ["hybrid"],
    "maxChunks": 30  // Increase for production
  },
  "vectorStore": {
    "type": "qdrant",
    "qdrant": {
      "url": "http://localhost:6333",
      "collectionName": "production_docs"
    }
  }
}
```

### 4. Initial Repository Sync

```bash
# Sync all repositories
universal-doc-mcp sync

# Or sync specific repository
universal-doc-mcp sync --repo dotnet-docs
```

### 5. Start the Server

```bash
# For MCP integration (Claude, Cursor)
universal-doc-mcp start --stdio

# For development/testing
universal-doc-mcp start
```

## Security Configuration

### Environment Variables

```bash
# Set in production environment
export NODE_ENV=production
export LOG_LEVEL=info
export QDRANT_URL=http://localhost:6333
export MAX_CHUNK_SIZE=2000
export RATE_LIMIT_SEARCH=30  # per minute
export RATE_LIMIT_UPSERT=100 # per minute
```

### File Permissions

```bash
# Restrict access to configuration
chmod 600 config/config.json

# Secure log directory
chmod 700 logs/

# Secure data directory
chmod 700 data/
```

### Network Security

```nginx
# Nginx reverse proxy example (if exposing API)
server {
    listen 443 ssl;
    server_name docs.internal.company.com;
    
    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api_limit burst=20 nodelay;
    }
}
```

## Performance Tuning

### Vector Store Optimization

```javascript
// Adjust in code if needed
const vectorStore = new VectorStore({
  type: 'qdrant',
  qdrant: {
    url: process.env.QDRANT_URL,
    collectionName: 'production_docs',
    // Optimize for production
    optimizers_config: {
      default_segment_number: 4,
      indexing_threshold: 20000
    }
  }
});
```

### Memory Management

```bash
# Set Node.js memory limit
NODE_OPTIONS="--max-old-space-size=2048" universal-doc-mcp start

# Monitor memory usage
universal-doc-mcp status --verbose
```

### Chunking Strategy

For production workloads, adjust chunking parameters:

```javascript
{
  "chunkingStrategy": {
    "maxChunkSize": 2000,    // Optimal for context
    "overlapSize": 300,      // Good continuity
    "respectBoundaries": true,
    "preserveContext": true
  }
}
```

## Monitoring

### Health Checks

```bash
# Check server status
universal-doc-mcp status

# Check Qdrant health
curl http://localhost:6333/health
```

### Logging

Production logs are stored with automatic rotation:

```
logs/
├── error.log      # Error level only
├── combined.log   # All logs
└── access.log     # API access logs
```

Monitor logs:

```bash
# Tail error logs
tail -f logs/error.log

# Search for specific errors
grep "VectorStoreError" logs/combined.log

# Check rate limiting
grep "rate limit" logs/combined.log
```

### Metrics

Key metrics to monitor:

- **Search latency**: Should be <500ms
- **Indexing throughput**: ~100 docs/minute
- **Memory usage**: Should stay under 1GB
- **Vector store size**: Monitor growth
- **Error rate**: Should be <1%

## Backup and Recovery

### Backup Qdrant Data

```bash
# Stop the service
docker stop qdrant

# Backup vector data
tar -czf qdrant-backup-$(date +%Y%m%d).tar.gz qdrant_storage/

# Restart service
docker start qdrant
```

### Backup Configuration

```bash
# Backup config and repos list
tar -czf config-backup-$(date +%Y%m%d).tar.gz config/ data/repositories/.git/
```

### Recovery

```bash
# Restore Qdrant data
tar -xzf qdrant-backup-20240315.tar.gz

# Restore configuration
tar -xzf config-backup-20240315.tar.gz

# Re-sync repositories
universal-doc-mcp sync
```

## Troubleshooting

### Common Issues

#### High Memory Usage

```bash
# Reduce batch size
export VECTOR_BATCH_SIZE=50

# Reduce concurrent operations
export MAX_CONCURRENT_SYNC=2
```

#### Slow Searches

```bash
# Optimize Qdrant
curl -X POST http://localhost:6333/collections/production_docs/index
```

#### Repository Sync Failures

```bash
# Check git credentials
git config --global credential.helper cache

# Increase timeout
export GIT_HTTP_TIMEOUT=300
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug universal-doc-mcp start

# Verbose output
universal-doc-mcp sync --verbose
```

## Scaling Considerations

### Horizontal Scaling

For large deployments, consider:

1. **Qdrant Cluster**: Deploy Qdrant in cluster mode
2. **Load Balancing**: Multiple MCP server instances
3. **Shared Storage**: Network-attached storage for repos

### Repository Management

For 100+ repositories:

```javascript
{
  "syncStrategy": {
    "concurrent": 5,        // Limit concurrent syncs
    "batchSize": 10,       // Process in batches
    "scheduleSpread": true  // Spread sync times
  }
}
```

## Integration Examples

### Systemd Service

```ini
[Unit]
Description=Universal Documentation MCP Server
After=network.target docker.service

[Service]
Type=simple
User=mcpuser
WorkingDirectory=/opt/universal-doc-mcp
ExecStart=/usr/bin/node /opt/universal-doc-mcp/dist/server.js --stdio
Restart=always
RestartSec=10
StandardOutput=append:/var/log/universal-doc-mcp/stdout.log
StandardError=append:/var/log/universal-doc-mcp/stderr.log
Environment="NODE_ENV=production"
Environment="LOG_LEVEL=info"

[Install]
WantedBy=multi-user.target
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY config/ ./config/

EXPOSE 3000

CMD ["node", "dist/server.js", "--stdio"]
```

## Best Practices

1. **Regular Maintenance**
   - Weekly repository syncs
   - Monthly vector store optimization
   - Quarterly configuration review

2. **Security**
   - Never expose MCP server to internet
   - Use VPN for remote access
   - Rotate logs regularly
   - Monitor for suspicious patterns

3. **Performance**
   - Index during off-hours
   - Limit concurrent operations
   - Monitor resource usage
   - Optimize chunk sizes for your docs

4. **Reliability**
   - Automated backups
   - Health monitoring
   - Graceful shutdown handling
   - Error alerting

## Support

For production support:
- GitHub Issues: https://github.com/olympus-cloud/mcp-server-docs-lookup/issues
- Documentation: https://docs.universal-doc-mcp.dev
- Security Issues: security@universal-doc-mcp.dev