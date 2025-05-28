import { Request, Response, NextFunction } from 'express';
import { logger } from "../utils/logger-stub"
import { metrics } from '../services/metrics';

export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string,
    details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;
    
    Error.captureStackTrace(this);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 400, true, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, true, 'NOT_FOUND');
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 409, true, 'CONFLICT', details);
  }
}

export class ServiceUnavailableError extends BaseError {
  constructor(service: string, reason?: string) {
    const message = reason 
      ? `Service '${service}' is unavailable: ${reason}`
      : `Service '${service}' is unavailable`;
    super(message, 503, true, 'SERVICE_UNAVAILABLE');
  }
}

export class ExternalServiceError extends BaseError {
  constructor(service: string, originalError?: any) {
    super(
      `External service error: ${service}`,
      502,
      true,
      'EXTERNAL_SERVICE_ERROR',
      { service, originalError: originalError?.message || originalError }
    );
  }
}

export class ConfigurationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 500, false, 'CONFIGURATION_ERROR', details);
  }
}

export class DatabaseError extends BaseError {
  constructor(operation: string, originalError?: any) {
    super(
      `Database operation failed: ${operation}`,
      500,
      true,
      'DATABASE_ERROR',
      { operation, originalError: originalError?.message || originalError }
    );
  }
}

interface ErrorResponse {
  error: {
    type: string;
    message: string;
    code?: string;
    details?: any;
    requestId?: string;
    timestamp: string;
  };
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private shutdownCallbacks: Array<() => Promise<void>> = [];

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  handleError(error: Error | BaseError): void {
    if (this.isOperationalError(error)) {
      logger.error('Operational error occurred', {
        error: {
          message: error.message,
          stack: error.stack,
          code: (error as BaseError).code,
          statusCode: (error as BaseError).statusCode,
          details: (error as BaseError).details
        }
      });
    } else {
      logger.error('Programming or unknown error occurred', {
        error: {
          message: error.message,
          stack: error.stack
        }
      });
    }

    metrics.increment('errors.total', {
      type: this.getErrorType(error),
      operational: String(this.isOperationalError(error))
    });
  }

  private isOperationalError(error: Error | BaseError): boolean {
    if (error instanceof BaseError) {
      return error.isOperational;
    }
    return false;
  }

  private getErrorType(error: Error | BaseError): string {
    if (error instanceof BaseError) {
      return error.code || error.constructor.name;
    }
    return error.name || 'UnknownError';
  }

  isTrustedError(error: Error): boolean {
    return error instanceof BaseError;
  }

  registerShutdownCallback(callback: () => Promise<void>): void {
    this.shutdownCallbacks.push(callback);
  }

  async shutdown(): Promise<void> {
    logger.info('Graceful shutdown initiated');
    
    for (const callback of this.shutdownCallbacks) {
      try {
        await callback();
      } catch (error) {
        logger.error('Error during shutdown callback', { error });
      }
    }
    
    logger.info('Graceful shutdown completed');
  }
}

export const errorHandler = ErrorHandler.getInstance();

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorMiddleware(
  error: Error | BaseError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  errorHandler.handleError(error);

  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error instanceof BaseError ? error.statusCode : 500;
  const isProduction = process.env.NODE_ENV === 'production';

  const errorResponse: ErrorResponse = {
    error: {
      type: error instanceof BaseError ? error.code || 'ERROR' : 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  };

  if (req.headers['x-request-id']) {
    errorResponse.error.requestId = req.headers['x-request-id'] as string;
  }

  if (!isProduction) {
    if (error instanceof BaseError && error.details) {
      errorResponse.error.details = error.details;
    }
    if (error.stack) {
      errorResponse.error.details = {
        ...errorResponse.error.details,
        stack: error.stack.split('\n')
      };
    }
  }

  res.status(statusCode).json(errorResponse);
}

export function notFoundHandler(req: Request, res: Response): void {
  const error = new NotFoundError('Endpoint', req.path);
  errorHandler.handleError(error);
  
  res.status(404).json({
    error: {
      type: 'NOT_FOUND',
      message: `Endpoint '${req.path}' not found`,
      timestamp: new Date().toISOString()
    }
  });
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime?: number;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly resetTimeout: number = 30000 // 30 seconds
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - (this.lastFailureTime || 0) > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new ServiceUnavailableError('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
    }
    this.failures = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      metrics.increment('circuit_breaker.opened');
      
      setTimeout(() => {
        this.state = 'HALF_OPEN';
        metrics.increment('circuit_breaker.half_opened');
      }, this.resetTimeout);
    }
  }

  getState(): string {
    return this.state;
  }
}

export class RetryHandler {
  constructor(
    private readonly maxRetries: number = 3,
    private readonly baseDelay: number = 1000,
    private readonly maxDelay: number = 10000,
    private readonly backoffMultiplier: number = 2
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: any) => boolean = () => true
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.maxRetries || !shouldRetry(error)) {
          throw error;
        }
        
        const delay = Math.min(
          this.baseDelay * Math.pow(this.backoffMultiplier, attempt),
          this.maxDelay
        );
        
        logger.warn(`Retry attempt ${attempt + 1}/${this.maxRetries}`, {
          error: error instanceof Error ? error.message : error,
          delay
        });
        
        metrics.increment('retry.attempt', { attempt: String(attempt + 1) });
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Process-level error handlers
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', { error });
  errorHandler.handleError(error);
  
  if (!errorHandler.isTrustedError(error)) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection', { reason, promise });
  
  throw reason;
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received');
  await errorHandler.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received');
  await errorHandler.shutdown();
  process.exit(0);
});