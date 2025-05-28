import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterAbstract } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { logger } from "../utils/logger-stub"
import { metrics } from '../services/metrics';
import { AuthRequest } from './auth';

export interface RateLimitConfig {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  useRedis?: boolean;
  redisClient?: Redis;
}

export interface RateLimitRule {
  path: string | RegExp;
  method?: string | string[];
  limits: {
    anonymous?: number;
    authenticated?: number;
    admin?: number;
    [role: string]: number | undefined;
  };
  windowMs?: number;
}

const defaultRules: RateLimitRule[] = [
  {
    path: '/api/context/generate',
    limits: {
      anonymous: 10,
      authenticated: 100,
      admin: 1000
    },
    windowMs: 60 * 1000 // 1 minute
  },
  {
    path: '/api/search',
    limits: {
      anonymous: 20,
      authenticated: 200,
      admin: 2000
    },
    windowMs: 60 * 1000
  },
  {
    path: '/api/repositories/sync',
    method: 'POST',
    limits: {
      anonymous: 0,
      authenticated: 5,
      admin: 50
    },
    windowMs: 60 * 60 * 1000 // 1 hour
  },
  {
    path: '/api',
    limits: {
      anonymous: 100,
      authenticated: 1000,
      admin: 10000
    },
    windowMs: 60 * 1000
  }
];

class RateLimitService {
  private limiters: Map<string, RateLimiterAbstract> = new Map();
  private rules: RateLimitRule[];
  private useRedis: boolean;
  private redisClient?: Redis;

  constructor(rules: RateLimitRule[] = defaultRules, redisClient?: Redis) {
    this.rules = rules;
    this.useRedis = !!redisClient;
    this.redisClient = redisClient;
    this.initializeLimiters();
  }

  private initializeLimiters(): void {
    for (const rule of this.rules) {
      const key = this.getRuleKey(rule);
      
      if (this.useRedis && this.redisClient) {
        this.limiters.set(key, new RateLimiterRedis({
          storeClient: this.redisClient,
          keyPrefix: `rate_limit:${key}`,
          points: Math.max(...Object.values(rule.limits).filter(v => v !== undefined) as number[]),
          duration: Math.floor((rule.windowMs || 60000) / 1000),
          blockDuration: 0
        }));
      } else {
        this.limiters.set(key, new RateLimiterMemory({
          keyPrefix: `rate_limit:${key}`,
          points: Math.max(...Object.values(rule.limits).filter(v => v !== undefined) as number[]),
          duration: Math.floor((rule.windowMs || 60000) / 1000),
          blockDuration: 0
        }));
      }
    }

    logger.info(`Initialized ${this.limiters.size} rate limiters`);
  }

  private getRuleKey(rule: RateLimitRule): string {
    const path = rule.path instanceof RegExp ? rule.path.source : rule.path;
    const method = Array.isArray(rule.method) ? rule.method.join(',') : (rule.method || 'ALL');
    return `${method}:${path}`;
  }

  private findMatchingRule(req: Request): RateLimitRule | null {
    for (const rule of this.rules) {
      const pathMatch = rule.path instanceof RegExp 
        ? rule.path.test(req.path)
        : req.path.startsWith(rule.path);

      if (!pathMatch) continue;

      if (rule.method) {
        const methods = Array.isArray(rule.method) ? rule.method : [rule.method];
        if (!methods.includes(req.method)) continue;
      }

      return rule;
    }

    return null;
  }

  private getRequestKey(req: AuthRequest): string {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }

    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (forwarded as string).split(',').map(ip => ip.trim());
      return `ip:${ips[0]}`;
    }

    return `ip:${req.socket.remoteAddress || 'unknown'}`;
  }

  private getUserRole(req: AuthRequest): string {
    return req.user?.role || 'anonymous';
  }

  async checkLimit(req: AuthRequest): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: Date;
  }> {
    const rule = this.findMatchingRule(req);
    if (!rule) {
      return {
        allowed: true,
        limit: 0,
        remaining: 0,
        resetAt: new Date()
      };
    }

    const role = this.getUserRole(req);
    const limit = rule.limits[role] ?? rule.limits.anonymous ?? 0;

    if (limit === 0) {
      return {
        allowed: false,
        limit: 0,
        remaining: 0,
        resetAt: new Date(Date.now() + (rule.windowMs || 60000))
      };
    }

    const limiterKey = this.getRuleKey(rule);
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      logger.error(`No limiter found for rule: ${limiterKey}`);
      return {
        allowed: true,
        limit: 0,
        remaining: 0,
        resetAt: new Date()
      };
    }

    const requestKey = this.getRequestKey(req);

    try {
      const result = await limiter.consume(requestKey, 1);
      
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - result.consumedPoints),
        resetAt: new Date(Date.now() + result.msBeforeNext)
      };
    } catch (rateLimiterRes) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: new Date(Date.now() + (rateLimiterRes as any).msBeforeNext)
      };
    }
  }

  async reset(req: AuthRequest): Promise<void> {
    const rule = this.findMatchingRule(req);
    if (!rule) return;

    const limiterKey = this.getRuleKey(rule);
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return;

    const requestKey = this.getRequestKey(req);
    await limiter.delete(requestKey);
  }
}

let rateLimitService: RateLimitService;

export function initializeRateLimit(rules?: RateLimitRule[], redisClient?: Redis): void {
  rateLimitService = new RateLimitService(rules || defaultRules, redisClient);
}

export function createRateLimiter(customRules?: RateLimitRule[]) {
  if (!rateLimitService) {
    const redisUrl = process.env.REDIS_URL;
    let redisClient: Redis | undefined;
    
    if (redisUrl) {
      redisClient = new Redis(redisUrl);
      redisClient.on('error', (err) => {
        logger.error('Redis connection error:', err);
      });
    }

    initializeRateLimit(customRules, redisClient);
  }

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await rateLimitService.checkLimit(req);

      res.setHeader('X-RateLimit-Limit', result.limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

      if (!result.allowed) {
        metrics.increment('rate_limit.exceeded', {
          path: req.path,
          role: req.user?.role || 'anonymous'
        });

        res.status(429).json({
          error: {
            type: 'rate_limit_exceeded',
            message: 'Too many requests, please try again later',
            retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)
          }
        });
        return;
      }

      metrics.increment('rate_limit.allowed', {
        path: req.path,
        role: req.user?.role || 'anonymous'
      });

      next();
    } catch (error) {
      logger.error('Rate limit error:', error);
      next();
    }
  };
}

export function createDynamicRateLimiter(config: RateLimitConfig) {
  const limiter = config.useRedis && config.redisClient
    ? new RateLimiterRedis({
        storeClient: config.redisClient,
        keyPrefix: 'rate_limit:dynamic',
        points: config.maxRequests || 100,
        duration: Math.floor((config.windowMs || 60000) / 1000),
        blockDuration: 0
      })
    : new RateLimiterMemory({
        keyPrefix: 'rate_limit:dynamic',
        points: config.maxRequests || 100,
        duration: Math.floor((config.windowMs || 60000) / 1000),
        blockDuration: 0
      });

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyGenerator ? config.keyGenerator(req) : req.ip || 'unknown';

    try {
      await limiter.consume(key);
      next();
    } catch (rateLimiterRes) {
      res.status(429).json({
        error: {
          type: 'rate_limit_exceeded',
          message: config.message || 'Too many requests',
          retryAfter: Math.round((rateLimiterRes as any).msBeforeNext / 1000) || 60
        }
      });
    }
  };
}

export async function resetRateLimit(req: AuthRequest): Promise<void> {
  if (rateLimitService) {
    await rateLimitService.reset(req);
  }
}

export { RateLimitService };