import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from "../utils/logger-stub"
import { metrics } from '../services/metrics';

export interface SecurityConfig {
  cors?: {
    origins?: string[];
    credentials?: boolean;
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    maxAge?: number;
  };
  contentSecurityPolicy?: boolean | any;
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  allowedIPs?: string[];
  trustedProxies?: string[];
}

const defaultSecurityConfig: SecurityConfig = {
  cors: {
    origins: ['http://localhost:*', 'https://localhost:*'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
};

export function loadSecurityConfig(): SecurityConfig {
  const config = { ...defaultSecurityConfig };

  if (process.env.CORS_ORIGINS) {
    config.cors!.origins = process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());
  }

  if (process.env.ALLOWED_IPS) {
    config.allowedIPs = process.env.ALLOWED_IPS.split(',').map(ip => ip.trim());
  }

  if (process.env.TRUSTED_PROXIES) {
    config.trustedProxies = process.env.TRUSTED_PROXIES.split(',').map(proxy => proxy.trim());
  }

  if (process.env.DISABLE_CSP === 'true') {
    config.contentSecurityPolicy = false;
  }

  return config;
}

export function setupSecurity(app: any, customConfig?: SecurityConfig): void {
  const config = { ...loadSecurityConfig(), ...customConfig };

  if (config.trustedProxies) {
    app.set('trust proxy', config.trustedProxies);
  }

  app.use(helmet({
    contentSecurityPolicy: config.contentSecurityPolicy,
    hsts: config.hsts
  }));

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowed = config.cors!.origins!.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(origin);
        }
        return pattern === origin;
      });

      if (allowed) {
        callback(null, true);
      } else {
        metrics.increment('security.cors.blocked', { origin });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: config.cors!.credentials,
    methods: config.cors!.methods,
    allowedHeaders: config.cors!.allowedHeaders,
    exposedHeaders: config.cors!.exposedHeaders,
    maxAge: config.cors!.maxAge
  };

  app.use(cors(corsOptions));

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });

  if (config.allowedIPs && config.allowedIPs.length > 0) {
    app.use(createIPWhitelist(config.allowedIPs));
  }

  app.use(preventPathTraversal);
  app.use(sanitizeHeaders);
  app.use(validateContentType);

  logger.info('Security middleware configured', {
    cors: !!config.cors,
    csp: !!config.contentSecurityPolicy,
    hsts: !!config.hsts,
    ipWhitelist: config.allowedIPs?.length || 0
  });
}

export function createIPWhitelist(allowedIPs: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = getClientIP(req);
    
    if (!clientIP || !allowedIPs.includes(clientIP)) {
      metrics.increment('security.ip_whitelist.blocked', { ip: clientIP || 'unknown' });
      logger.warn(`Blocked request from unauthorized IP: ${clientIP}`);
      res.status(403).json({
        error: {
          type: 'forbidden',
          message: 'Access denied'
        }
      });
      return;
    }

    next();
  };
}

export function getClientIP(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (forwarded as string).split(',').map(ip => ip.trim());
    return ips[0];
  }

  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP as string;
  }

  return req.socket.remoteAddress || null;
}

export function preventPathTraversal(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  
  if (path.includes('..') || path.includes('//') || path.includes('\\')) {
    metrics.increment('security.path_traversal.blocked');
    logger.warn(`Path traversal attempt blocked: ${path}`);
    res.status(400).json({
      error: {
        type: 'bad_request',
        message: 'Invalid path'
      }
    });
    return;
  }

  next();
}

export function sanitizeHeaders(req: Request, res: Response, next: NextFunction): void {
  const suspiciousHeaders = [
    'x-forwarded-host',
    'x-original-url',
    'x-rewrite-url'
  ];

  for (const header of suspiciousHeaders) {
    if (req.headers[header]) {
      logger.warn(`Suspicious header detected and removed: ${header}`);
      delete req.headers[header];
    }
  }

  const maxHeaderSize = 8192;
  for (const [, value] of Object.entries(req.headers)) {
    if (typeof value === 'string' && value.length > maxHeaderSize) {
      metrics.increment('security.header_size.blocked');
      res.status(431).json({
        error: {
          type: 'request_header_fields_too_large',
          message: 'Request header too large'
        }
      });
      return;
    }
  }

  next();
}

export function validateContentType(req: Request, res: Response, next: NextFunction): void {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const contentType = req.headers['content-type'];
    
    if (!contentType) {
      metrics.increment('security.content_type.missing');
      res.status(400).json({
        error: {
          type: 'bad_request',
          message: 'Content-Type header required'
        }
      });
      return;
    }

    const allowedTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain'
    ];

    const isAllowed = allowedTypes.some(type => contentType.includes(type));
    
    if (!isAllowed) {
      metrics.increment('security.content_type.invalid');
      res.status(415).json({
        error: {
          type: 'unsupported_media_type',
          message: 'Unsupported content type'
        }
      });
      return;
    }
  }

  next();
}

export function createSecurityHeaders(options: {
  nonce?: string;
  reportUri?: string;
} = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (options.nonce) {
      res.locals.nonce = options.nonce;
    }

    if (options.reportUri) {
      res.setHeader('Report-To', JSON.stringify({
        group: 'default',
        max_age: 31536000,
        endpoints: [{ url: options.reportUri }]
      }));
      
      res.setHeader('NEL', JSON.stringify({
        report_to: 'default',
        max_age: 31536000
      }));
    }

    next();
  };
}