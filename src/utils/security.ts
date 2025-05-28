import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import logger from './logger';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
    Object.setPrototypeOf(this, SecurityError.prototype);
  }
}

export interface PathValidationOptions {
  allowedPaths: string[];
  allowSymlinks?: boolean;
  maxDepth?: number;
}

export class SecurityValidator {
  private static readonly DANGEROUS_PATTERNS = [
    /\.\./,                     // Directory traversal
    /~\//,                      // Home directory access
    /\0/,                       // Null bytes
    /%2e%2e/i,                  // URL encoded traversal
    /[:*?"<>|]/,                // Invalid Windows characters
  ];

  private static readonly SAFE_EXTENSIONS = new Set([
    '.md', '.mdx', '.txt', '.rst', '.html', '.htm',
    '.json', '.yaml', '.yml', '.toml', '.xml',
    '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
    '.py', '.java', '.cs', '.go', '.rs', '.cpp', '.c', '.h',
    '.css', '.scss', '.sass', '.less',
    '.sh', '.bash', '.zsh', '.fish',
    '.dockerfile', '.dockerignore',
    '.gitignore', '.gitattributes',
    '.env.example', '.env.sample'
  ]);

  private static readonly BLOCKED_FILES = new Set([
    '.env', '.env.local', '.env.production', '.env.development',
    'secrets', 'credentials', 'private.key', 'id_rsa',
    '.ssh', '.gnupg', '.aws', '.azure',
    'config.json', 'settings.json', 'appsettings.json'
  ]);

  static validatePath(
    inputPath: string,
    options: PathValidationOptions
  ): string {
    // Normalize and resolve the path
    const normalizedPath = path.normalize(inputPath);
    
    // Check for dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(normalizedPath)) {
        throw new SecurityError(`Invalid path pattern detected: ${inputPath}`);
      }
    }

    // Ensure path is within allowed directories
    const resolvedPath = path.resolve(normalizedPath);
    const isAllowed = options.allowedPaths.some(allowedPath => {
      const resolvedAllowed = path.resolve(allowedPath);
      return resolvedPath.startsWith(resolvedAllowed + path.sep) || 
             resolvedPath === resolvedAllowed;
    });

    if (!isAllowed) {
      throw new SecurityError(`Path is outside allowed directories: ${inputPath}`);
    }

    // Check symlinks if not allowed
    if (!options.allowSymlinks) {
      try {
        const realPath = fs.realpathSync(resolvedPath);
        if (realPath !== resolvedPath) {
          throw new SecurityError(`Symlinks are not allowed: ${inputPath}`);
        }
      } catch (error) {
        // Path doesn't exist yet, which is fine for write operations
        if ((error as any).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    // Check depth limit
    if (options.maxDepth !== undefined) {
      const depth = normalizedPath.split(path.sep).length;
      if (depth > options.maxDepth) {
        throw new SecurityError(`Path exceeds maximum depth: ${inputPath}`);
      }
    }

    return resolvedPath;
  }

  static validateFileName(fileName: string): void {
    const baseName = path.basename(fileName);
    
    // Check for blocked files
    if (this.BLOCKED_FILES.has(baseName.toLowerCase())) {
      throw new SecurityError(`Access to file is restricted: ${fileName}`);
    }

    // Check extension
    const ext = path.extname(fileName).toLowerCase();
    if (ext && !this.SAFE_EXTENSIONS.has(ext)) {
      logger.warn('Potentially unsafe file extension', { fileName, ext });
    }
  }

  static sanitizeInput(input: string, maxLength: number = 1000): string {
    // Remove null bytes (actual null bytes, not escaped strings)
    // eslint-disable-next-line no-control-regex
    let sanitized = input.replace(/\u0000/g, '');
    
    // Trim to max length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }
    
    // Remove control characters except newlines and tabs
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    
    return sanitized;
  }

  static sanitizeMetadata(metadata: any): any {
    if (typeof metadata !== 'object' || metadata === null) {
      return {};
    }

    const sanitized: any = {};
    const safeKeys = [
      'title', 'description', 'tags', 'category', 'language',
      'framework', 'version', 'author', 'date', 'priority',
      'documentTitle', 'documentDescription', 'headingContext'
    ];

    for (const key of safeKeys) {
      if (key in metadata) {
        const value = metadata[key];
        if (typeof value === 'string') {
          sanitized[key] = this.sanitizeInput(value, 500);
        } else if (Array.isArray(value)) {
          sanitized[key] = value
            .filter(v => typeof v === 'string')
            .map(v => this.sanitizeInput(v, 100))
            .slice(0, 20);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          sanitized[key] = value;
        } else if (value instanceof Date) {
          sanitized[key] = value.toISOString();
        }
      }
    }

    return sanitized;
  }

  static hashSensitiveData(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  static redactSensitiveInfo(text: string): string {
    // Redact JWT tokens first (before generic API key pattern)
    text = text.replace(/\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\b/g, '[REDACTED_JWT]');
    
    // Redact potential API keys
    text = text.replace(/([a-zA-Z0-9]{32,})/g, '[REDACTED_KEY]');
    
    // Redact email addresses
    text = text.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[REDACTED_EMAIL]');
    
    // Redact IP addresses
    text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]');
    
    // Redact potential passwords
    text = text.replace(/password["\s:=]+["']?([^"'\s]+)["']?/gi, 'password: [REDACTED]');
    
    return text;
  }

  static validateRepositoryUrl(url: string): void {
    // Handle SSH URLs differently
    if (url.startsWith('git@')) {
      // SSH URL format: git@hostname:user/repo.git
      const sshPattern = /^git@([^:]+):(.+)\.git$/;
      const match = url.match(sshPattern);
      if (!match) {
        throw new SecurityError(`Invalid SSH repository URL format: ${url}`);
      }
      
      const hostname = match[1].toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')
      ) {
        throw new SecurityError('Access to internal repositories is not allowed');
      }
      return;
    }

    try {
      const parsed = new URL(url);
      
      // Only allow specific protocols
      if (!['http:', 'https:', 'git:'].includes(parsed.protocol)) {
        throw new SecurityError(`Invalid repository protocol: ${parsed.protocol}`);
      }
      
      // Check for localhost/internal IPs
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')
      ) {
        throw new SecurityError('Access to internal repositories is not allowed');
      }
    } catch (error) {
      if (error instanceof SecurityError) {
        throw error;
      }
      throw new SecurityError(`Invalid repository URL: ${url}`);
    }
  }

  static createSecureConfig(config: any): any {
    const secureConfig = { ...config };
    
    // Remove sensitive fields
    delete secureConfig.auth;
    delete secureConfig.apiKeys;
    delete secureConfig.tokens;
    delete secureConfig.credentials;
    delete secureConfig.secrets;
    
    // Sanitize repository configs
    if (secureConfig.repositories) {
      secureConfig.repositories = secureConfig.repositories.map((repo: any) => ({
        ...repo,
        auth: undefined,
        token: undefined,
        password: undefined,
        credentials: undefined
      }));
    }
    
    return secureConfig;
  }
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}
  
  check(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }
  
  reset(key: string): void {
    this.requests.delete(key);
  }
  
  cleanup(): void {
    const now = Date.now();
    for (const [key, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validRequests);
      }
    }
  }
}