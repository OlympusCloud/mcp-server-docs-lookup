import { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
// import { logger } from "../utils/logger-stub"
import { metrics } from '../services/metrics';

export interface ApiProtectionConfig {
  enableRequestSigning?: boolean;
  enableReplayProtection?: boolean;
  replayWindowMs?: number;
  enableRequestIdValidation?: boolean;
  enablePayloadValidation?: boolean;
  maxPayloadSize?: number;
  enableTimestampValidation?: boolean;
  timestampToleranceMs?: number;
  secret?: string;
}

const defaultConfig: ApiProtectionConfig = {
  enableRequestSigning: true,
  enableReplayProtection: true,
  replayWindowMs: 5 * 60 * 1000, // 5 minutes
  enableRequestIdValidation: true,
  enablePayloadValidation: true,
  maxPayloadSize: 10 * 1024 * 1024, // 10MB
  enableTimestampValidation: true,
  timestampToleranceMs: 5 * 60 * 1000, // 5 minutes
  secret: process.env.API_SIGNING_SECRET || 'default-signing-secret'
};

class ReplayProtection {
  private usedNonces: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timer;

  constructor(private windowMs: number) {
    this.cleanupInterval = setInterval(() => this.cleanup(), this.windowMs);
  }

  check(nonce: string): boolean {
    const now = Date.now();
    
    if (this.usedNonces.has(nonce)) {
      const usedAt = this.usedNonces.get(nonce)!;
      if (now - usedAt < this.windowMs) {
        return false;
      }
    }

    this.usedNonces.set(nonce, now);
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [nonce, timestamp] of this.usedNonces.entries()) {
      if (now - timestamp > this.windowMs) {
        this.usedNonces.delete(nonce);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval as any);
  }
}

export class ApiProtectionService {
  private config: ApiProtectionConfig;
  private replayProtection?: ReplayProtection;

  constructor(config: ApiProtectionConfig = {}) {
    this.config = { ...defaultConfig, ...config };
    
    if (this.config.enableReplayProtection) {
      this.replayProtection = new ReplayProtection(this.config.replayWindowMs!);
    }
  }

  generateSignature(
    method: string,
    path: string,
    timestamp: number,
    nonce: string,
    body?: any
  ): string {
    const payload = [
      method.toUpperCase(),
      path,
      timestamp.toString(),
      nonce,
      body ? JSON.stringify(body) : ''
    ].join('\n');

    return createHash('sha256')
      .update(payload)
      .update(this.config.secret!)
      .digest('hex');
  }

  validateSignature(req: Request): boolean {
    const signature = req.headers['x-api-signature'] as string;
    const timestamp = parseInt(req.headers['x-api-timestamp'] as string);
    const nonce = req.headers['x-api-nonce'] as string;

    if (!signature || !timestamp || !nonce) {
      return false;
    }

    const expectedSignature = this.generateSignature(
      req.method,
      req.originalUrl || req.url,
      timestamp,
      nonce,
      req.body
    );

    return signature === expectedSignature;
  }

  validateTimestamp(timestamp: number): boolean {
    const now = Date.now();
    const diff = Math.abs(now - timestamp);
    return diff <= this.config.timestampToleranceMs!;
  }

  validateNonce(nonce: string): boolean {
    if (!this.replayProtection) {
      return true;
    }
    return this.replayProtection.check(nonce);
  }

  validateRequestId(requestId: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(requestId);
  }

  destroy(): void {
    if (this.replayProtection) {
      this.replayProtection.destroy();
    }
  }
}

let apiProtectionService: ApiProtectionService;

export function initializeApiProtection(config?: ApiProtectionConfig): void {
  if (apiProtectionService) {
    apiProtectionService.destroy();
  }
  apiProtectionService = new ApiProtectionService(config);
}

export function apiProtection(options: ApiProtectionConfig = {}) {
  if (!apiProtectionService) {
    initializeApiProtection(options);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    if (options.enableRequestIdValidation !== false) {
      const requestId = req.headers['x-request-id'] as string;
      if (!requestId) {
        req.headers['x-request-id'] = randomBytes(16).toString('hex');
      } else if (!apiProtectionService.validateRequestId(requestId)) {
        metrics.increment('api_protection.invalid_request_id');
        return res.status(400).json({
          error: {
            type: 'bad_request',
            message: 'Invalid request ID format'
          }
        });
      }
    }

    if (options.enableTimestampValidation !== false) {
      const timestamp = req.headers['x-api-timestamp'] as string;
      if (!timestamp) {
        metrics.increment('api_protection.missing_timestamp');
        return res.status(400).json({
          error: {
            type: 'bad_request',
            message: 'Missing API timestamp'
          }
        });
      }

      const timestampNum = parseInt(timestamp);
      if (isNaN(timestampNum) || !apiProtectionService.validateTimestamp(timestampNum)) {
        metrics.increment('api_protection.invalid_timestamp');
        return res.status(400).json({
          error: {
            type: 'bad_request',
            message: 'Invalid or expired timestamp'
          }
        });
      }
    }

    if (options.enableRequestSigning !== false) {
      if (!apiProtectionService.validateSignature(req)) {
        metrics.increment('api_protection.invalid_signature');
        return res.status(401).json({
          error: {
            type: 'authentication_error',
            message: 'Invalid request signature'
          }
        });
      }
    }

    if (options.enableReplayProtection !== false) {
      const nonce = req.headers['x-api-nonce'] as string;
      if (!nonce) {
        metrics.increment('api_protection.missing_nonce');
        return res.status(400).json({
          error: {
            type: 'bad_request',
            message: 'Missing API nonce'
          }
        });
      }

      if (!apiProtectionService.validateNonce(nonce)) {
        metrics.increment('api_protection.replay_detected');
        return res.status(400).json({
          error: {
            type: 'bad_request',
            message: 'Replay attack detected'
          }
        });
      }
    }

    if (options.enablePayloadValidation !== false && req.body) {
      const contentLength = parseInt(req.headers['content-length'] || '0');
      if (contentLength > (options.maxPayloadSize || defaultConfig.maxPayloadSize!)) {
        metrics.increment('api_protection.payload_too_large');
        return res.status(413).json({
          error: {
            type: 'payload_too_large',
            message: 'Request payload too large'
          }
        });
      }
    }

    metrics.increment('api_protection.passed');
    return next();
  };
}

export function generateApiCredentials(): {
  apiKey: string;
  secret: string;
  exampleHeaders: Record<string, string>;
} {
  const apiKey = `mcp_${randomBytes(16).toString('hex')}`;
  const secret = randomBytes(32).toString('hex');
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString('hex');

  const service = new ApiProtectionService({ secret });
  const signature = service.generateSignature('GET', '/api/test', timestamp, nonce);

  return {
    apiKey,
    secret,
    exampleHeaders: {
      'X-API-Key': apiKey,
      'X-API-Timestamp': timestamp.toString(),
      'X-API-Nonce': nonce,
      'X-API-Signature': signature
    }
  };
}

export function createApiClient(baseUrl: string, apiKey: string, secret: string) {
  const service = new ApiProtectionService({ secret });

  return {
    async request(method: string, path: string, data?: any): Promise<Response> {
      const timestamp = Date.now();
      const nonce = randomBytes(16).toString('hex');
      const requestId = randomBytes(16).toString('hex');

      const signature = service.generateSignature(
        method,
        path,
        timestamp,
        nonce,
        data
      );

      const headers: Record<string, string> = {
        'X-API-Key': apiKey,
        'X-API-Timestamp': timestamp.toString(),
        'X-API-Nonce': nonce,
        'X-API-Signature': signature,
        'X-Request-ID': requestId,
        'Content-Type': 'application/json'
      };

      const options: RequestInit = {
        method,
        headers
      };

      if (data) {
        options.body = JSON.stringify(data);
      }

      return fetch(`${baseUrl}${path}`, options) as any;
    }
  };
}