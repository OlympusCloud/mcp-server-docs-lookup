import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { SecurityValidator } from './security';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

winston.addColors(logColors);

// Custom format to sanitize sensitive information
const sanitizeFormat = winston.format((info) => {
  // Sanitize message
  if (typeof info.message === 'string') {
    info.message = SecurityValidator.redactSensitiveInfo(info.message);
  }
  
  // Sanitize metadata
  if (info.metadata) {
    info.metadata = sanitizeMetadata(info.metadata);
  }
  
  // Sanitize error messages
  if (info.error && typeof info.error === 'string') {
    info.error = SecurityValidator.redactSensitiveInfo(info.error);
  }
  
  // Sanitize additional fields
  const sensitiveFields = ['password', 'token', 'key', 'secret', 'auth', 'credentials'];
  for (const field of sensitiveFields) {
    if (info[field]) {
      info[field] = '[REDACTED]';
    }
  }
  
  return info;
})();

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  sanitizeFormat,
  winston.format.splat(),
  winston.format.json()
);

// Check if running as MCP server (stdio mode)
const isMCPMode = process.argv.includes('--stdio') || process.env.MCP_MODE === 'true';

// In MCP mode, redirect all console output to stderr to avoid interfering with stdio protocol
const consoleFormat = winston.format.combine(
  isMCPMode ? winston.format.uncolorize() : winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}`
  )
);

export const logger = winston.createLogger({
  levels: logLevels,
  format,
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.LOG_LEVEL || (isMCPMode ? 'error' : 'info'),
      silent: isMCPMode && process.env.MCP_DEBUG !== 'true',
      stderrLevels: isMCPMode ? ['error', 'warn', 'info', 'debug'] : ['error', 'warn']
    }),
  ],
});

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (error) {
    // If we can't create logs directory, just use console logging
    console.warn('Could not create logs directory, using console only:', error);
  }
}

// Only add file transports if logs directory exists
if (fs.existsSync(logsDir)) {
  logger.add(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      handleExceptions: false,
      handleRejections: false
    })
  );
  
  logger.add(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      handleExceptions: false,
      handleRejections: false
    })
  );
}

// Helper function to sanitize metadata objects
function sanitizeMetadata(metadata: any): any {
  if (typeof metadata !== 'object' || metadata === null) {
    return metadata;
  }
  
  const sanitized: any = {};
  const safeKeys = [
    'repository', 'filepath', 'documentId', 'chunkId',
    'type', 'category', 'language', 'framework',
    'timestamp', 'duration', 'count', 'size',
    'status', 'method', 'path', 'statusCode'
  ];
  
  for (const key in metadata) {
    if (safeKeys.includes(key)) {
      sanitized[key] = metadata[key];
    } else if (typeof metadata[key] === 'string') {
      sanitized[key] = SecurityValidator.redactSensitiveInfo(metadata[key]);
    } else if (typeof metadata[key] === 'number' || typeof metadata[key] === 'boolean') {
      sanitized[key] = metadata[key];
    }
  }
  
  return sanitized;
}

// Safe logging methods that ensure no PII is logged
export const safeLogger = {
  error: (message: string, meta?: any) => {
    logger.error(message, sanitizeMetadata(meta));
  },
  warn: (message: string, meta?: any) => {
    logger.warn(message, sanitizeMetadata(meta));
  },
  info: (message: string, meta?: any) => {
    logger.info(message, sanitizeMetadata(meta));
  },
  debug: (message: string, meta?: any) => {
    logger.debug(message, sanitizeMetadata(meta));
  }
};

export default logger;