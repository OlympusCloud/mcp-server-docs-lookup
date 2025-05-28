import { describe, it, expect } from '@jest/globals';
import { InputValidator, ValidationError } from '../../../src/utils/validation';

describe('InputValidator', () => {
  describe('validateSearchDocs', () => {
    it('should validate valid search parameters', () => {
      const input = {
        query: 'React hooks',
        language: 'javascript',
        framework: 'react',
        repositories: ['docs-repo'],
        maxResults: 10
      };

      const result = InputValidator.validateSearchDocs(input);
      expect(result.query).toBe('React hooks');
      expect(result.language).toBe('javascript');
      expect(result.framework).toBe('react');
      expect(result.maxResults).toBe(10);
    });

    it('should apply default values', () => {
      const input = { query: 'test query' };
      const result = InputValidator.validateSearchDocs(input);
      expect(result.maxResults).toBe(20); // default value
    });

    it('should reject missing required fields', () => {
      expect(() => {
        InputValidator.validateSearchDocs({});
      }).toThrow(ValidationError);
    });

    it('should reject invalid query length', () => {
      expect(() => {
        InputValidator.validateSearchDocs({
          query: '' // empty query
        });
      }).toThrow(ValidationError);

      expect(() => {
        InputValidator.validateSearchDocs({
          query: 'a'.repeat(501) // too long
        });
      }).toThrow(ValidationError);
    });

    it('should reject invalid language format', () => {
      expect(() => {
        InputValidator.validateSearchDocs({
          query: 'test',
          language: 'invalid-lang@#$'
        });
      }).toThrow(ValidationError);
    });

    it('should reject invalid maxResults', () => {
      expect(() => {
        InputValidator.validateSearchDocs({
          query: 'test',
          maxResults: 0 // below minimum
        });
      }).toThrow(ValidationError);

      expect(() => {
        InputValidator.validateSearchDocs({
          query: 'test',
          maxResults: 101 // above maximum
        });
      }).toThrow(ValidationError);
    });

    it('should limit repositories array size', () => {
      const input = {
        query: 'test',
        repositories: new Array(15).fill('repo') // too many
      };

      expect(() => {
        InputValidator.validateSearchDocs(input);
      }).toThrow(ValidationError);
    });

    it('should sanitize string inputs', () => {
      const input = {
        query: 'test with <script>alert("xss")</script>',
        language: 'javascript'
      };

      const result = InputValidator.validateSearchDocs(input);
      expect(result.query).not.toContain('<script>');
    });
  });

  describe('validateGetContext', () => {
    it('should validate valid context parameters', () => {
      const input = {
        task: 'implement JWT authentication',
        language: 'typescript',
        framework: 'express',
        maxResults: 15
      };

      const result = InputValidator.validateGetContext(input);
      expect(result.task).toBe('implement JWT authentication');
      expect(result.language).toBe('typescript');
      expect(result.maxResults).toBe(15);
    });

    it('should reject missing task', () => {
      expect(() => {
        InputValidator.validateGetContext({});
      }).toThrow(ValidationError);
    });

    it('should truncate task length to maximum', () => {
      const result = InputValidator.validateGetContext({
        task: 'a'.repeat(1001) // too long, should be truncated
      });
      expect(result.task).toHaveLength(1000); // maxLength from schema
    });

    it('should apply default maxResults', () => {
      const input = { task: 'test task' };
      const result = InputValidator.validateGetContext(input);
      expect(result.maxResults).toBe(20);
    });
  });

  describe('validateSyncRepository', () => {
    it('should validate valid sync parameters', () => {
      const input = { repository: 'test-repo' };
      const result = InputValidator.validateSyncRepository(input);
      expect(result.repository).toBe('test-repo');
    });

    it('should reject missing repository', () => {
      expect(() => {
        InputValidator.validateSyncRepository({});
      }).toThrow(ValidationError);
    });

    it('should reject invalid repository name format', () => {
      expect(() => {
        InputValidator.validateSyncRepository({
          repository: 'invalid-repo@#$'
        });
      }).toThrow(ValidationError);
    });

    it('should reject repository name too long', () => {
      expect(() => {
        InputValidator.validateSyncRepository({
          repository: 'a'.repeat(101)
        });
      }).toThrow(ValidationError);
    });
  });

  describe('validateRepositoryConfig', () => {
    it('should validate valid repository configuration', () => {
      const input = {
        name: 'test-repo',
        url: 'https://github.com/test/repo.git',
        branch: 'main',
        paths: ['/docs'],
        priority: 'high'
      };

      const result = InputValidator.validateRepositoryConfig(input);
      expect(result.name).toBe('test-repo');
      expect(result.url).toBe('https://github.com/test/repo.git');
      expect(result.branch).toBe('main');
    });

    it('should apply default values', () => {
      const input = {
        name: 'test-repo',
        url: 'https://github.com/test/repo.git'
      };

      const result = InputValidator.validateRepositoryConfig(input);
      expect(result.branch).toBe('main');
      expect(result.authType).toBe('none');
      expect(result.paths).toEqual(['/']);
      expect(result.priority).toBe('medium');
      expect(result.syncInterval).toBe(60);
    });

    it('should reject missing required fields', () => {
      expect(() => {
        InputValidator.validateRepositoryConfig({
          name: 'test-repo'
          // missing url
        });
      }).toThrow(ValidationError);
    });

    it('should reject invalid URL format', () => {
      expect(() => {
        InputValidator.validateRepositoryConfig({
          name: 'test-repo',
          url: 'not-a-valid-url'
        });
      }).toThrow(ValidationError);
    });

    it('should reject invalid name format', () => {
      expect(() => {
        InputValidator.validateRepositoryConfig({
          name: 'invalid-name@#$',
          url: 'https://github.com/test/repo.git'
        });
      }).toThrow(ValidationError);
    });

    it('should validate authType enum', () => {
      expect(() => {
        InputValidator.validateRepositoryConfig({
          name: 'test-repo',
          url: 'https://github.com/test/repo.git',
          authType: 'invalid-auth-type'
        });
      }).toThrow(ValidationError);
    });

    it('should validate priority enum', () => {
      expect(() => {
        InputValidator.validateRepositoryConfig({
          name: 'test-repo',
          url: 'https://github.com/test/repo.git',
          priority: 'invalid-priority'
        });
      }).toThrow(ValidationError);
    });

    it('should limit paths array size', () => {
      expect(() => {
        InputValidator.validateRepositoryConfig({
          name: 'test-repo',
          url: 'https://github.com/test/repo.git',
          paths: new Array(25).fill('/path') // too many
        });
      }).toThrow(ValidationError);
    });

    it('should validate syncInterval range', () => {
      expect(() => {
        InputValidator.validateRepositoryConfig({
          name: 'test-repo',
          url: 'https://github.com/test/repo.git',
          syncInterval: 5 // below minimum
        });
      }).toThrow(ValidationError);

      expect(() => {
        InputValidator.validateRepositoryConfig({
          name: 'test-repo',
          url: 'https://github.com/test/repo.git',
          syncInterval: 20000 // above maximum
        });
      }).toThrow(ValidationError);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid full configuration', () => {
      const input = {
        project: {
          name: 'test-project',
          description: 'Test project'
        },
        repositories: [
          {
            name: 'test-repo',
            url: 'https://github.com/test/repo.git'
          }
        ],
        contextGeneration: {
          strategies: ['hybrid'],
          maxChunks: 25
        },
        vectorStore: {
          type: 'qdrant',
          qdrant: {
            url: 'http://localhost:6333',
            collectionName: 'test-docs'
          }
        }
      };

      const result = InputValidator.validateConfig(input);
      expect(result.project.name).toBe('test-project');
      expect(result.repositories).toHaveLength(1);
      expect(result.vectorStore.type).toBe('qdrant');
    });

    it('should reject missing required project fields', () => {
      expect(() => {
        InputValidator.validateConfig({
          repositories: []
        });
      }).toThrow(ValidationError);
    });

    it('should validate nested repository configurations', () => {
      const input = {
        project: { name: 'test' },
        repositories: [
          {
            name: 'invalid-repo@#$', // invalid name
            url: 'https://github.com/test/repo.git'
          }
        ]
      };

      expect(() => {
        InputValidator.validateConfig(input);
      }).toThrow(ValidationError);
    });

    it('should limit repositories array size', () => {
      const input = {
        project: { name: 'test' },
        repositories: new Array(55).fill({
          name: 'repo',
          url: 'https://github.com/test/repo.git'
        })
      };

      expect(() => {
        InputValidator.validateConfig(input);
      }).toThrow(ValidationError);
    });

    it('should validate context generation strategies', () => {
      const input = {
        project: { name: 'test' },
        repositories: [],
        contextGeneration: {
          strategies: ['invalid-strategy']
        }
      };

      expect(() => {
        InputValidator.validateConfig(input);
      }).toThrow(ValidationError);
    });
  });

  describe('validateMCPRequest', () => {
    it('should route to correct validator based on method', () => {
      const searchParams = { query: 'test' };
      const result = InputValidator.validateMCPRequest('search_docs', searchParams);
      expect(result.query).toBe('test');
    });

    it('should handle list_repos with no parameters', () => {
      const result = InputValidator.validateMCPRequest('list_repos', {});
      expect(result).toEqual({});
    });

    it('should reject unknown methods', () => {
      expect(() => {
        InputValidator.validateMCPRequest('unknown_method', {});
      }).toThrow(ValidationError);
    });
  });

  describe('sanitizeBasicInput', () => {
    it('should handle null and undefined inputs', () => {
      expect(() => {
        InputValidator.validateSearchDocs(null);
      }).toThrow(ValidationError);

      expect(() => {
        InputValidator.validateSearchDocs(undefined);
      }).toThrow(ValidationError);
    });

    it('should reject non-object inputs', () => {
      expect(() => {
        InputValidator.validateSearchDocs('not an object');
      }).toThrow(ValidationError);
    });

    it('should remove prototype pollution attempts', () => {
      const maliciousInput = {
        query: 'test',
        __proto__: { admin: true },
        constructor: { name: 'hacked' }
      };

      const result = InputValidator.validateSearchDocs(maliciousInput);
      // __proto__ pollution should be sanitized, but constructor is a normal property
      expect(result.__proto__).toBeDefined(); // This will be the normal object prototype
      expect(result.constructor).toBe(Object); // Normal Object constructor, not the malicious one
      expect((result as any).admin).toBeUndefined(); // The malicious admin property should be gone
    });
  });
});