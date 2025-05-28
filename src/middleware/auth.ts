import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { logger } from "../utils/logger-stub"
// import { config } from '../config';
import { metrics } from '../services/metrics';
import { AuthRequest } from '../types/express';

export { AuthRequest };

export class AuthenticationError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string, public statusCode: number = 403) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export interface ApiKey {
  id: string;
  key: string;
  name: string;
  role: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

class AuthService {
  private apiKeys: Map<string, ApiKey> = new Map();
  private jwtSecret: string;
  private tokenExpiry: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.tokenExpiry = process.env.JWT_EXPIRY || '24h';
    
    if (this.jwtSecret === 'default-secret-change-in-production' && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production environment');
    }

    this.loadApiKeys();
  }

  private loadApiKeys(): void {
    const apiKeysConfig = process.env.API_KEYS;
    if (apiKeysConfig) {
      try {
        const keys = JSON.parse(apiKeysConfig);
        keys.forEach((keyConfig: any) => {
          const hashedKey = this.hashApiKey(keyConfig.key);
          this.apiKeys.set(hashedKey, {
            ...keyConfig,
            key: hashedKey,
            createdAt: new Date(keyConfig.createdAt || Date.now()),
            expiresAt: keyConfig.expiresAt ? new Date(keyConfig.expiresAt) : undefined
          });
        });
        logger.info(`Loaded ${this.apiKeys.size} API keys`);
      } catch (error) {
        logger.error('Failed to load API keys:', error);
      }
    }
  }

  private hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  generateApiKey(name: string, role: string = 'user', scopes: string[] = []): { id: string; key: string } {
    const id = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const rawKey = `mcp_${Math.random().toString(36).substr(2, 32)}`;
    const hashedKey = this.hashApiKey(rawKey);

    const apiKey: ApiKey = {
      id,
      key: hashedKey,
      name,
      role,
      scopes,
      createdAt: new Date()
    };

    this.apiKeys.set(hashedKey, apiKey);
    
    return { id, key: rawKey };
  }

  validateApiKey(key: string): ApiKey | null {
    const hashedKey = this.hashApiKey(key);
    const apiKey = this.apiKeys.get(hashedKey);

    if (!apiKey) {
      return null;
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    apiKey.lastUsedAt = new Date();
    return apiKey;
  }

  generateJWT(payload: any): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.tokenExpiry } as jwt.SignOptions);
  }

  verifyJWT(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new AuthenticationError('Invalid or expired token');
    }
  }

  checkScopes(requiredScopes: string[], userScopes: string[]): boolean {
    if (userScopes.includes('*')) return true;
    return requiredScopes.every(scope => userScopes.includes(scope));
  }
}

export const authService = new AuthService();

export function authenticateApiKey(req: AuthRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    metrics.increment('auth.api_key.missing');
    return next(new AuthenticationError('API key required'));
  }

  const validKey = authService.validateApiKey(apiKey);
  if (!validKey) {
    metrics.increment('auth.api_key.invalid');
    return next(new AuthenticationError('Invalid API key'));
  }

  req.user = {
    id: validKey.id,
    role: validKey.role,
    scopes: validKey.scopes
  };

  metrics.increment('auth.api_key.success', { role: validKey.role });
  next();
}

export function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    metrics.increment('auth.jwt.missing');
    return next(new AuthenticationError('Bearer token required'));
  }

  const token = authHeader.substring(7);

  try {
    const payload = authService.verifyJWT(token);
    req.user = payload;
    metrics.increment('auth.jwt.success', { role: payload.role });
    next();
  } catch (error) {
    metrics.increment('auth.jwt.invalid');
    next(error);
  }
}

export function authenticate(type: 'apiKey' | 'jwt' | 'any' = 'any') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (type === 'apiKey') {
      return authenticateApiKey(req, res, next);
    } else if (type === 'jwt') {
      return authenticateJWT(req, res, next);
    } else {
      const apiKey = req.headers['x-api-key'];
      const authHeader = req.headers.authorization;

      if (apiKey) {
        return authenticateApiKey(req, res, next);
      } else if (authHeader?.startsWith('Bearer ')) {
        return authenticateJWT(req, res, next);
      } else {
        metrics.increment('auth.missing');
        return next(new AuthenticationError('Authentication required'));
      }
    }
  };
}

export function authorize(requiredScopes: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (req.user.role === 'admin') {
      next();
      return;
    }

    if (!authService.checkScopes(requiredScopes, req.user.scopes || [])) {
      metrics.increment('auth.authorization.failed', { 
        role: req.user.role || 'unknown',
        required: requiredScopes.join(',')
      });
      return next(new AuthorizationError(`Insufficient permissions. Required scopes: ${requiredScopes.join(', ')}`));
    }

    metrics.increment('auth.authorization.success', { role: req.user.role || 'unknown' });
    next();
  };
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  const authHeader = req.headers.authorization;

  if (!apiKey && !authHeader) {
    next();
    return;
  }

  authenticate('any')(req, res, (err) => {
    if (err) {
      logger.warn('Optional auth failed:', err.message);
    }
    next();
  });
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AuthenticationError) {
    res.status(err.statusCode).json({
      error: {
        type: 'authentication_error',
        message: err.message
      }
    });
  } else if (err instanceof AuthorizationError) {
    res.status(err.statusCode).json({
      error: {
        type: 'authorization_error',
        message: err.message
      }
    });
  } else {
    next(err);
  }
}