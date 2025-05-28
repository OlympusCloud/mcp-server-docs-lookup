import { describe, it, expect, beforeEach } from '@jest/globals';
import { SecurityValidator, SecurityError, RateLimiter } from '../../../src/utils/security';
import * as path from 'path';

describe('SecurityValidator', () => {
  describe('validatePath', () => {
    it('should validate safe paths within allowed directories', () => {
      const allowedPaths = ['/home/user/docs'];
      const inputPath = '/home/user/docs/test.md';
      
      const result = SecurityValidator.validatePath(inputPath, {
        allowedPaths,
        allowSymlinks: false
      });
      
      expect(result).toBe(path.resolve(inputPath));
    });

    it('should reject directory traversal attempts', () => {
      const allowedPaths = ['/home/user/docs'];
      const inputPath = '/home/user/docs/../../../etc/passwd';
      
      expect(() => {
        SecurityValidator.validatePath(inputPath, {
          allowedPaths,
          allowSymlinks: false
        });
      }).toThrow(SecurityError);
    });

    it('should reject paths outside allowed directories', () => {
      const allowedPaths = ['/home/user/docs'];
      const inputPath = '/home/user/other/file.txt';
      
      expect(() => {
        SecurityValidator.validatePath(inputPath, {
          allowedPaths,
          allowSymlinks: false
        });
      }).toThrow(SecurityError);
    });

    it('should reject null byte attacks', () => {
      const allowedPaths = ['/home/user/docs'];
      const inputPath = '/home/user/docs/test\0.md';
      
      expect(() => {
        SecurityValidator.validatePath(inputPath, {
          allowedPaths,
          allowSymlinks: false
        });
      }).toThrow(SecurityError);
    });

    it('should enforce maximum depth limits', () => {
      const allowedPaths = ['/home/user/docs'];
      const inputPath = '/home/user/docs/a/b/c/d/e/f/deep.md';
      
      expect(() => {
        SecurityValidator.validatePath(inputPath, {
          allowedPaths,
          allowSymlinks: false,
          maxDepth: 5
        });
      }).toThrow(SecurityError);
    });
  });

  describe('validateFileName', () => {
    it('should allow safe file extensions', () => {
      expect(() => {
        SecurityValidator.validateFileName('document.md');
      }).not.toThrow();
    });

    it('should block restricted files', () => {
      expect(() => {
        SecurityValidator.validateFileName('.env');
      }).toThrow(SecurityError);

      expect(() => {
        SecurityValidator.validateFileName('private.key');
      }).toThrow(SecurityError);
    });

    it('should block sensitive configuration files', () => {
      expect(() => {
        SecurityValidator.validateFileName('config.json');
      }).toThrow(SecurityError);
    });
  });

  describe('sanitizeInput', () => {
    it('should remove null bytes', () => {
      const input = 'test\u0000content';
      const result = SecurityValidator.sanitizeInput(input);
      expect(result).toBe('testcontent');
    });

    it('should limit input length', () => {
      const input = 'a'.repeat(2000);
      const result = SecurityValidator.sanitizeInput(input, 100);
      expect(result.length).toBe(100);
    });

    it('should remove control characters but preserve newlines', () => {
      const input = 'test\u0001content\nwith\u0002newline';
      const result = SecurityValidator.sanitizeInput(input);
      expect(result).toContain('\n');
      expect(result).not.toContain('\u0001');
      expect(result).not.toContain('\u0002');
    });
  });

  describe('sanitizeMetadata', () => {
    it('should sanitize metadata object with allowed keys', () => {
      const metadata = {
        title: 'Test Title',
        description: 'Test Description',
        password: 'secret123',
        apiKey: 'key-123',
        author: 'Test Author'
      };

      const result = SecurityValidator.sanitizeMetadata(metadata);
      
      expect(result.title).toBe('Test Title');
      expect(result.description).toBe('Test Description');
      expect(result.author).toBe('Test Author');
      expect(result.password).toBeUndefined();
      expect(result.apiKey).toBeUndefined();
    });

    it('should handle nested objects safely', () => {
      const metadata = {
        title: 'Test',
        nested: {
          unsafe: 'data'
        }
      };

      const result = SecurityValidator.sanitizeMetadata(metadata);
      expect(result.nested).toBeUndefined();
    });

    it('should limit array sizes', () => {
      const metadata = {
        tags: new Array(50).fill('tag')
      };

      const result = SecurityValidator.sanitizeMetadata(metadata);
      expect(result.tags.length).toBe(20); // maxItems limit
    });
  });

  describe('redactSensitiveInfo', () => {
    it('should redact API keys', () => {
      const text = 'API key: sk-1234567890abcdef1234567890abcdef';
      const result = SecurityValidator.redactSensitiveInfo(text);
      expect(result).toContain('[REDACTED_KEY]');
      expect(result).not.toContain('sk-1234567890abcdef1234567890abcdef');
    });

    it('should redact email addresses', () => {
      const text = 'Contact user@example.com for support';
      const result = SecurityValidator.redactSensitiveInfo(text);
      expect(result).toContain('[REDACTED_EMAIL]');
      expect(result).not.toContain('user@example.com');
    });

    it('should redact IP addresses', () => {
      const text = 'Server at 192.168.1.100 is down';
      const result = SecurityValidator.redactSensitiveInfo(text);
      expect(result).toContain('[REDACTED_IP]');
      expect(result).not.toContain('192.168.1.100');
    });

    it('should redact JWT tokens', () => {
      const text = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = SecurityValidator.redactSensitiveInfo(text);
      expect(result).toContain('[REDACTED_JWT]');
    });

    it('should redact passwords', () => {
      const text = 'password: "mySecret123"';
      const result = SecurityValidator.redactSensitiveInfo(text);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('mySecret123');
    });
  });

  describe('validateRepositoryUrl', () => {
    it('should allow valid HTTPS repository URLs', () => {
      expect(() => {
        SecurityValidator.validateRepositoryUrl('https://github.com/user/repo.git');
      }).not.toThrow();
    });

    it('should allow valid SSH repository URLs', () => {
      expect(() => {
        SecurityValidator.validateRepositoryUrl('git@github.com:user/repo.git');
      }).not.toThrow();
    });

    it('should reject localhost URLs', () => {
      expect(() => {
        SecurityValidator.validateRepositoryUrl('http://localhost:3000/repo.git');
      }).toThrow(SecurityError);
    });

    it('should reject internal network URLs', () => {
      expect(() => {
        SecurityValidator.validateRepositoryUrl('https://192.168.1.100/repo.git');
      }).toThrow(SecurityError);

      expect(() => {
        SecurityValidator.validateRepositoryUrl('https://10.0.0.1/repo.git');
      }).toThrow(SecurityError);
    });

    it('should reject invalid protocols', () => {
      expect(() => {
        SecurityValidator.validateRepositoryUrl('ftp://example.com/repo.git');
      }).toThrow(SecurityError);
    });
  });

  describe('createSecureConfig', () => {
    it('should remove sensitive fields from config', () => {
      const config = {
        project: { name: 'test' },
        repositories: [
          {
            name: 'repo1',
            url: 'https://github.com/test/repo.git',
            auth: { token: 'secret' },
            password: 'secret'
          }
        ],
        apiKeys: { openai: 'sk-123' },
        secrets: { database: 'password' }
      };

      const result = SecurityValidator.createSecureConfig(config);
      
      expect(result.project).toBeDefined();
      expect(result.repositories).toBeDefined();
      expect(result.repositories[0].auth).toBeUndefined();
      expect(result.repositories[0].password).toBeUndefined();
      expect(result.apiKeys).toBeUndefined();
      expect(result.secrets).toBeUndefined();
    });
  });
});

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(5, 60000); // 5 requests per minute
  });

  it('should allow requests within limit', () => {
    expect(rateLimiter.check('user1')).toBe(true);
    expect(rateLimiter.check('user1')).toBe(true);
    expect(rateLimiter.check('user1')).toBe(true);
  });

  it('should block requests exceeding limit', () => {
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      expect(rateLimiter.check('user1')).toBe(true);
    }
    
    // Should be blocked now
    expect(rateLimiter.check('user1')).toBe(false);
  });

  it('should track different keys separately', () => {
    // Exhaust limit for user1
    for (let i = 0; i < 5; i++) {
      expect(rateLimiter.check('user1')).toBe(true);
    }
    
    // user2 should still be allowed
    expect(rateLimiter.check('user2')).toBe(true);
  });

  it('should reset rate limit for specific key', () => {
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      rateLimiter.check('user1');
    }
    expect(rateLimiter.check('user1')).toBe(false);
    
    // Reset and try again
    rateLimiter.reset('user1');
    expect(rateLimiter.check('user1')).toBe(true);
  });

  it('should cleanup old entries', () => {
    rateLimiter.check('user1');
    
    // Mock time passage
    const originalNow = Date.now;
    Date.now = jest.fn(() => originalNow() + 70000); // 70 seconds later
    
    rateLimiter.cleanup();
    
    // Should be able to make requests again
    expect(rateLimiter.check('user1')).toBe(true);
    
    // Restore Date.now
    Date.now = originalNow;
  });
});