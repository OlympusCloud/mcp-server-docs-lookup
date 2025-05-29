# Troubleshooting Guide

## Connection Issues

### "Connection closed" Error in Claude
**Symptoms**: Claude shows "Connection closed" error when using MCP server
**Solutions**:
1. Restart the MCP server: `claude mcp restart olympus-docs`
2. Check if Node.js is properly installed: `node --version`
3. Verify the server builds without errors: `npm run build`
4. Check Claude Desktop logs for specific error messages

### API Server Not Starting
**Symptoms**: GitHub Copilot API integration fails to start
**Solutions**:
1. Check if port 3001 is available: `lsof -i :3001`
2. Verify the build completed: `ls -la dist/`
3. Check API server logs: `tail -f logs/api-server.log`
4. Restart with: `./setup-olympus.sh --dev-mode`

## Memory Issues

### Heap Out of Memory
**Symptoms**: Server crashes with heap memory errors
**Solutions**:
1. The setup scripts automatically configure memory limits
2. Manually set: `export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"`
3. Restart Qdrant: `docker restart qdrant`

## Build Issues

### TypeScript Compilation Errors
**Symptoms**: `npm run build` fails with TypeScript errors
**Solutions**:
1. Clean and rebuild: `rm -rf dist/ && npm run build`
2. Check Node.js version: `node --version` (should be 18+)
3. Update dependencies: `npm update`

### Missing Dependencies
**Symptoms**: Module not found errors
**Solutions**:
1. Clean install: `rm -rf node_modules package-lock.json && npm install`
2. Check if all peer dependencies are installed
3. Verify package.json integrity

## Configuration Issues

### Qdrant Connection Failed
**Symptoms**: Vector database connection errors
**Solutions**:
1. Start Qdrant: `docker start qdrant`
2. Check if port 6333 is available: `curl http://localhost:6333/`
3. Reset Qdrant data: `docker rm qdrant && ./setup-olympus.sh`

### Documentation Sync Errors
**Symptoms**: Git sync failures or missing documentation
**Solutions**:
1. Check network connectivity
2. Verify GitHub token (for private repos): `echo $GITHUB_TOKEN`
3. Manual sync: `npm run sync`
4. Reset data directory: `rm -rf data/repositories/ && ./setup-olympus.sh`

## VS Code Integration

### Cline/Continue Extension Issues
**Symptoms**: Extensions can't connect to MCP server
**Solutions**:
1. Verify VS Code settings were updated
2. Restart VS Code completely
3. Check extension logs in VS Code Developer Tools
4. Re-run setup: `./setup-olympus.sh --skip-sync`

### GitHub Copilot API Issues
**Symptoms**: API endpoints not accessible
**Solutions**:
1. Check if API server is running: `curl http://localhost:3001/health`
2. Verify CORS configuration in `config/api-config.json`
3. Restart API server: `pkill -f "cli.js start" && ./setup-olympus.sh`

## Logs and Debugging

### Enable Debug Mode
```bash
# Run with enhanced logging
./setup-olympus.sh --dev-mode

# Check all logs
tail -f logs/*.log

# MCP server logs
DEBUG=* npm run dev:modular
```

### Key Log Files
- `logs/api-server.log` - API server output
- `logs/combined.log` - General application logs
- `logs/error.log` - Error-specific logs
- `mcp-server.log` - MCP protocol logs

## Getting Help

1. Check this troubleshooting guide first
2. Review the setup script output for specific errors
3. Enable debug mode for detailed logging
4. Check GitHub issues for known problems
5. Contact Olympus Cloud support with log files

