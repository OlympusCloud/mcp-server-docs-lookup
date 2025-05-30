FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY config ./config

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling and curl for health checks
RUN apk add --no-cache dumb-init curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production --no-audit && \
    npm cache clean --force

# Copy built application and config from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config

# Create required directories with proper permissions
RUN mkdir -p data/repositories logs qdrant_storage && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Expose port (configurable via environment variable)
EXPOSE ${PORT:-3000}

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Default command uses unified server
CMD ["node", "dist/cli.js", "start", "--mode", "api"]