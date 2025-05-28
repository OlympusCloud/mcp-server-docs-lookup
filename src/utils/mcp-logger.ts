import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { SecurityValidator } from './security';

// Create a specialized MCP logger that doesn't use colors or fancy formatting
// when running in stdio mode to avoid ANSI codes breaking MCP protocol

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Check if running as MCP server (stdio mode)
const isMCPMode = process.argv.includes('--stdio') || process.env.MCP_MODE === 'true';
const isMCPDebug = process.env.MCP_DEBUG === 'true';

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

// Create appropriate logger based on MCP mode
let logger: winston.Logger;

if (isMCPMode) {
  // In MCP mode, only log to files and stderr, never to stdout
  const transports: winston.transport[] = [];
  
  // Only add console transport if debug mode is enabled
  if (isMCPDebug) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.printf(
            (info) => `[${info.timestamp}] ${info.level}: ${info.message}`
          )
        ),
        level: 'debug',
        stderrLevels: ['error', 'warn', 'info', 'debug'], // All logs to stderr in MCP mode
      })
    );
  }
  
  // Ensure logs directory exists
  const logsDir = path.join(process.cwd(), 'logs');
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Always add file transports
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'mcp-error.log'),
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          sanitizeFormat,
          winston.format.json()
        )
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'mcp-combined.log'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          sanitizeFormat,
          winston.format.json()
        )
      })
    );
  } catch (error) {
    // If we can't create logs directory, just use null transport
  }
  
  logger = winston.createLogger({
    levels: logLevels,
    level: isMCPDebug ? 'debug' : 'error',
    transports: transports.length > 0 ? transports : [new winston.transports.Console({ silent: true })]
  });
} else {
  // Normal mode with colors and formatting
  const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    sanitizeFormat,
    winston.format.splat(),
    winston.format.json()
  );

  const consoleFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.printf(
      (info) => `${info.timestamp} [${info.level}]: ${info.message}`
    )
  );

  logger = winston.createLogger({
    levels: logLevels,
    format,
    transports: [
      new winston.transports.Console({
        format: consoleFormat,
        level: process.env.LOG_LEVEL || 'info',
      }),
    ],
  });

  // Ensure logs directory exists
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    try {
      fs.mkdirSync(logsDir, { recursive: true });
    } catch (error) {
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