import logger from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  onRetry?: (error: Error, attempt: number) => void;
}

const defaultOptions: Required<Omit<RetryOptions, 'retryableErrors'>> & { retryableErrors?: string[] } = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
    'RATE_LIMIT',
    'VECTOR_STORE_UNAVAILABLE'
  ],
  onRetry: (error, attempt) => {
    logger.warn(`Retry attempt ${attempt}`, { 
      error: error.message,
      errorCode: (error as any).code,
      errorName: error.name
    });
  }
};

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'RetryError';
    Object.setPrototypeOf(this, RetryError.prototype);
  }
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (!isRetryableError(lastError, opts.retryableErrors)) {
        logger.error('Non-retryable error encountered', {
          error: lastError.message,
          errorCode: (lastError as any).code,
          errorName: lastError.name
        });
        throw lastError;
      }
      
      if (attempt === opts.maxAttempts) {
        break;
      }

      opts.onRetry(lastError, attempt);
      
      // Add jitter to prevent thundering herd
      const jitteredDelay = delay * (0.5 + Math.random() * 0.5);
      await sleep(jitteredDelay);
      
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw new RetryError(
    `Operation failed after ${opts.maxAttempts} attempts: ${lastError!.message}`,
    opts.maxAttempts,
    lastError!
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(timeoutError || new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]);
}

function isRetryableError(error: Error, retryableErrors?: string[]): boolean {
  if (!retryableErrors || retryableErrors.length === 0) {
    return true;
  }
  
  const errorCode = (error as any).code;
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name;
  
  return retryableErrors.some(retryable => {
    const retryableLower = retryable.toLowerCase();
    return (
      errorCode === retryable ||
      errorMessage.includes(retryableLower) ||
      errorName === retryable
    );
  });
}

export const retryStrategies = {
  database: {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 10000,
    backoffMultiplier: 2
  },
  network: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  },
  vectorStore: {
    maxAttempts: 4,
    initialDelay: 2000,
    maxDelay: 20000,
    backoffMultiplier: 1.5
  },
  gitSync: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 15000,
    backoffMultiplier: 2,
    retryableErrors: ['ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'AUTH_FAILED'] as string[]
  }
};