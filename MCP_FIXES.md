# MCP Server Fixes for VS Code Copilot Integration

## Issues Fixed

### 1. ANSI Color Codes in Logger Output
**Problem**: The Winston logger was outputting ANSI color codes (like `\u001b[32m`) which caused "Failed to parse message" warnings in VS Code Copilot.

**Solution**: 
- Modified `src/utils/logger.ts` to detect when running in MCP mode (`--stdio` flag or `MCP_MODE` env var)
- Disabled colorization when in MCP mode
- Redirected all console output to stderr to avoid polluting the stdio protocol
- Created a specialized MCP entry point (`src/mcp-stdio.ts`) that overrides console methods

### 2. Memory Management and --expose-gc Flag
**Problem**: The server had critical heap usage issues and needed the `--expose-gc` flag for proper garbage collection.

**Solution**:
- Added `--expose-gc` flag to all MCP-related npm scripts
- Fixed initialization order in `src/server.ts` to create PerformanceMonitor before VectorStore
- Added aggressive memory cleanup routines that run every 5 minutes
- Implemented automatic garbage collection when heap usage exceeds 80%
- Added `.unref()` to all intervals to prevent memory leaks from keeping the process alive

## Implementation Details

### Logger Changes
```typescript
// Detect MCP mode
const isMCPMode = process.argv.includes('--stdio') || process.env.MCP_MODE === 'true';

// Disable colors in MCP mode
const consoleFormat = winston.format.combine(
  isMCPMode ? winston.format.uncolorize() : winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}`
  )
);

// Redirect all output to stderr in MCP mode
stderrLevels: isMCPMode ? ['error', 'warn', 'info', 'debug'] : ['error', 'warn']
```

### Memory Management
```typescript
// Periodic cleanup with heap monitoring
const memoryCleanupInterval = setInterval(() => {
  // Clear caches
  if (this.embeddingService) {
    this.embeddingService.clearCache();
  }
  
  // Check heap usage
  const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  if (heapPercentage > 80) {
    // Aggressive cleanup
    if (global.gc) {
      global.gc();
      global.gc(); // Run twice for thorough cleanup
    }
  }
}, 300000);

memoryCleanupInterval.unref(); // Don't keep process alive
```

### New MCP Entry Point
Created `src/mcp-stdio.ts` that:
- Sets `MCP_MODE=true` environment variable
- Overrides console methods to prevent stdout pollution
- Handles uncaught exceptions gracefully
- Ensures clean stdio communication

## Usage

### For VS Code Copilot
The server now properly detects when it's running as an MCP server and adjusts its behavior:
- No ANSI color codes in output
- All logs go to stderr or log files
- Automatic memory management with garbage collection
- Clean stdio protocol communication

### Environment Variables
- `MCP_MODE=true`: Forces MCP mode behavior
- `MCP_DEBUG=true`: Enables debug logging to stderr in MCP mode

### Running the Server
```bash
# Development mode with MCP
npm run mcp

# Or directly
NODE_OPTIONS='--max-old-space-size=4096 --expose-gc' node dist/mcp-stdio.js
```

## Testing
To test the fixes:
1. Build the project: `npm run build`
2. Run in MCP mode: `npm run mcp`
3. Send a test request via stdin:
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
```

You should see a clean JSON response without any ANSI codes or console pollution.