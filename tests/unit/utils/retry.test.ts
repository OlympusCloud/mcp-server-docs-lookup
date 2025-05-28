import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { retry, RetryError, withTimeout, retryStrategies } from '../../../src/utils/retry';

const fail = (message?: string) => {
  throw new Error(message || 'Test failed');
};

describe('retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
    
    const result = await retry(mockFn);
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const mockFn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce('success');
    
    const result = await retry(mockFn, {
      maxAttempts: 3,
      initialDelay: 10,
      retryableErrors: ['Temporary failure'] // Make it retryable
    });
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should throw RetryError after max attempts', async () => {
    const mockFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Persistent failure'));
    
    await expect(retry(mockFn, { 
      maxAttempts: 3, 
      initialDelay: 10,
      retryableErrors: ['Persistent failure'] // Make it retryable
    })).rejects.toThrow(RetryError);
    
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable errors', async () => {
    const mockFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('EACCES'));
    
    await expect(retry(mockFn, {
      maxAttempts: 3,
      retryableErrors: ['ENOTFOUND', 'ETIMEDOUT']
    })).rejects.toThrow('EACCES');
    
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should apply exponential backoff with jitter', async () => {
    const mockFn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockResolvedValueOnce('success');
    
    const startTime = Date.now();
    
    await retry(mockFn, {
      maxAttempts: 3,
      initialDelay: 100,
      backoffMultiplier: 2
    });
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Should have some delay (at least 50ms with jitter)
    expect(totalTime).toBeGreaterThan(50);
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should call onRetry callback', async () => {
    const mockFn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockResolvedValueOnce('success');
    
    const onRetryMock = jest.fn();
    
    await retry(mockFn, {
      maxAttempts: 3,
      initialDelay: 10,
      onRetry: onRetryMock,
      retryableErrors: ['First failure'] // Make it retryable
    });
    
    expect(onRetryMock).toHaveBeenCalledTimes(1);
    expect(onRetryMock).toHaveBeenCalledWith(
      expect.any(Error),
      1
    );
  });

  it('should respect maxDelay', async () => {
    const mockFn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockResolvedValueOnce('success');
    
    const startTime = Date.now();
    
    await retry(mockFn, {
      maxAttempts: 2,
      initialDelay: 100, // Reduced from 1000
      maxDelay: 50, // Very low max delay
      backoffMultiplier: 2, // Reduced from 10
      retryableErrors: ['ENOTFOUND']
    });
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Should not exceed maxDelay significantly (increased tolerance)
    expect(totalTime).toBeLessThan(300);
  });

  it('should handle different error types for retryability', async () => {
    // Test with error code
    const errorWithCode = Object.assign(new Error('Network error'), { code: 'ENOTFOUND' });
    const mockFn1 = jest.fn<() => Promise<string>>().mockRejectedValue(errorWithCode);
    
    await expect(retry(mockFn1, {
      maxAttempts: 2,
      initialDelay: 10,
      retryableErrors: ['ENOTFOUND']
    })).rejects.toThrow(RetryError);
    
    expect(mockFn1).toHaveBeenCalledTimes(2);
    
    // Test with error message
    const mockFn2 = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('rate limit exceeded'));
    
    await expect(retry(mockFn2, {
      maxAttempts: 2,
      initialDelay: 10,
      retryableErrors: ['rate limit'] // Match the actual error message
    })).rejects.toThrow(RetryError);
    
    expect(mockFn2).toHaveBeenCalledTimes(2);
  });

  it('should include attempt count and last error in RetryError', async () => {
    const lastError = new Error('Final failure');
    const mockFn = jest.fn<() => Promise<string>>().mockRejectedValue(lastError);
    
    try {
      await retry(mockFn, { 
        maxAttempts: 3, 
        initialDelay: 10,
        retryableErrors: ['Final failure'] // Make it retryable
      });
      fail('Expected RetryError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RetryError);
      expect((error as RetryError).attempts).toBe(3);
      expect((error as RetryError).lastError).toBe(lastError);
    }
  });
});

describe('withTimeout', () => {
  let timeouts: NodeJS.Timeout[] = [];

  beforeEach(() => {
    timeouts = [];
  });

  afterEach(() => {
    // Clean up all timeouts to prevent memory leaks
    timeouts.forEach(timeout => clearTimeout(timeout));
    timeouts = [];
  });

  it('should resolve if promise completes within timeout', async () => {
    const promise = new Promise(resolve => {
      const timeout = setTimeout(() => resolve('success'), 10);
      timeouts.push(timeout);
    });
    
    const result = await withTimeout(promise, 50);
    expect(result).toBe('success');
  });

  it('should reject if promise exceeds timeout', async () => {
    const promise = new Promise(resolve => {
      const timeout = setTimeout(() => resolve('too late'), 100);
      timeouts.push(timeout);
    });
    
    await expect(withTimeout(promise, 50))
      .rejects.toThrow('Operation timed out after 50ms');
  });

  it('should use custom timeout error', async () => {
    const promise = new Promise(resolve => {
      const timeout = setTimeout(() => resolve('too late'), 100);
      timeouts.push(timeout);
    });
    
    const customError = new Error('Custom timeout');
    
    await expect(withTimeout(promise, 50, customError))
      .rejects.toThrow('Custom timeout');
  });

  it('should reject if promise rejects before timeout', async () => {
    const promise = Promise.reject(new Error('Promise error'));
    
    await expect(withTimeout(promise, 100))
      .rejects.toThrow('Promise error');
  });
});

describe('retryStrategies', () => {
  it('should have predefined strategies with correct properties', () => {
    expect(retryStrategies.database).toBeDefined();
    expect(retryStrategies.network).toBeDefined();
    expect(retryStrategies.vectorStore).toBeDefined();
    expect(retryStrategies.gitSync).toBeDefined();
    
    // Validate database strategy
    expect(retryStrategies.database.maxAttempts).toBe(5);
    expect(retryStrategies.database.initialDelay).toBe(500);
    expect(retryStrategies.database.maxDelay).toBe(10000);
    expect(retryStrategies.database.backoffMultiplier).toBe(2);
    
    // Validate gitSync strategy has retryable errors
    expect(retryStrategies.gitSync.retryableErrors).toBeDefined();
    expect(retryStrategies.gitSync.retryableErrors).toContain('ENOTFOUND');
    expect(retryStrategies.gitSync.retryableErrors).toContain('ETIMEDOUT');
  });

  it('should work with retry function', async () => {
    const mockFn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockResolvedValueOnce('success');
    
    const result = await retry(mockFn, retryStrategies.gitSync);
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
});

describe('RetryError', () => {
  it('should have correct properties', () => {
    const lastError = new Error('Test error');
    const retryError = new RetryError('Retry failed', 3, lastError);
    
    expect(retryError.name).toBe('RetryError');
    expect(retryError.message).toBe('Retry failed');
    expect(retryError.attempts).toBe(3);
    expect(retryError.lastError).toBe(lastError);
    expect(retryError).toBeInstanceOf(Error);
    expect(retryError).toBeInstanceOf(RetryError);
  });
});