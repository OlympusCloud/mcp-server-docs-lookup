import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { SecurityValidator } from './security';
// import logger from './logger';

const ajv = new Ajv({ 
  allErrors: true, 
  removeAdditional: true,
  coerceTypes: true,
  useDefaults: true
});

// Add format validators including 'uri'
addFormats(ajv);

export class ValidationError extends Error {
  constructor(message: string, public errors?: any[]) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// MCP Request Schemas
const searchDocsSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      maxLength: 500
    },
    language: {
      type: 'string',
      pattern: '^[a-zA-Z0-9+#-]+$',
      maxLength: 50
    },
    framework: {
      type: 'string',
      pattern: '^[a-zA-Z0-9-_.]+$',
      maxLength: 50
    },
    repositories: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[a-zA-Z0-9-_]+$',
        maxLength: 100
      },
      maxItems: 10
    },
    maxResults: {
      type: 'number',
      minimum: 1,
      maximum: 100,
      default: 20
    }
  },
  required: ['query'],
  additionalProperties: false
};

const getContextSchema = {
  type: 'object',
  properties: {
    task: {
      type: 'string',
      minLength: 1,
      maxLength: 1000
    },
    language: {
      type: 'string',
      pattern: '^[a-zA-Z0-9+#-]+$',
      maxLength: 50
    },
    framework: {
      type: 'string',
      pattern: '^[a-zA-Z0-9-_.]+$',
      maxLength: 50
    },
    maxResults: {
      type: 'number',
      minimum: 1,
      maximum: 100,
      default: 20
    }
  },
  required: ['task'],
  additionalProperties: false
};

const syncRepositorySchema = {
  type: 'object',
  properties: {
    repository: {
      type: 'string',
      pattern: '^[a-zA-Z0-9-_]+$',
      maxLength: 100
    }
  },
  required: ['repository'],
  additionalProperties: false
};

// Repository Config Schema
const repositoryConfigSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      pattern: '^[a-zA-Z0-9-_]+$',
      minLength: 1,
      maxLength: 100
    },
    url: {
      type: 'string',
      format: 'uri',
      pattern: '^(https?|git|ssh)://'
    },
    branch: {
      type: 'string',
      pattern: '^[a-zA-Z0-9-_/.]+$',
      maxLength: 100,
      default: 'main'
    },
    authType: {
      type: 'string',
      enum: ['none', 'token', 'ssh'],
      default: 'none'
    },
    paths: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[a-zA-Z0-9-_/. ]+$',
        maxLength: 200
      },
      maxItems: 20,
      default: ['/']
    },
    exclude: {
      type: 'array',
      items: {
        type: 'string',
        maxLength: 100
      },
      maxItems: 50,
      default: []
    },
    syncInterval: {
      type: 'number',
      minimum: 10,
      maximum: 10080, // 1 week in minutes
      default: 60
    },
    priority: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      default: 'medium'
    },
    category: {
      type: 'string',
      pattern: '^[a-zA-Z0-9-_ ]+$',
      maxLength: 50
    }
  },
  required: ['name', 'url'],
  additionalProperties: false
};

// Config Schema
const configSchema = {
  type: 'object',
  properties: {
    project: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 100
        },
        description: {
          type: 'string',
          maxLength: 500
        }
      },
      required: ['name'],
      additionalProperties: false
    },
    repositories: {
      type: 'array',
      items: repositoryConfigSchema,
      maxItems: 50
    },
    contextGeneration: {
      type: 'object',
      properties: {
        strategies: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['semantic', 'structural', 'hybrid']
          },
          default: ['hybrid']
        },
        maxChunks: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 20
        }
      },
      additionalProperties: false
    },
    vectorStore: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['qdrant'],
          default: 'qdrant'
        },
        qdrant: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              default: 'http://localhost:6333'
            },
            collectionName: {
              type: 'string',
              pattern: '^[a-zA-Z0-9-_]+$',
              maxLength: 50,
              default: 'documentation'
            }
          },
          additionalProperties: false
        }
      },
      required: ['type'],
      additionalProperties: false
    }
  },
  required: ['project', 'repositories'],
  additionalProperties: true // Allow for future extensions
};

// Compile validators
const validators = {
  searchDocs: ajv.compile(searchDocsSchema),
  getContext: ajv.compile(getContextSchema),
  syncRepository: ajv.compile(syncRepositorySchema),
  repositoryConfig: ajv.compile(repositoryConfigSchema),
  config: ajv.compile(configSchema)
};

export class InputValidator {
  static validateSearchDocs(input: any): any {
    const sanitized = this.sanitizeBasicInput(input) as any;
    
    if (!validators.searchDocs(sanitized)) {
      throw new ValidationError(
        'Invalid search_docs parameters',
        validators.searchDocs.errors || undefined
      );
    }
    
    // Additional security validation
    if (typeof sanitized.query === 'string') {
      sanitized.query = SecurityValidator.sanitizeInput(sanitized.query);
    }
    
    return sanitized;
  }
  
  static validateGetContext(input: any): any {
    const sanitized = this.sanitizeBasicInput(input) as any;
    
    if (!validators.getContext(sanitized)) {
      throw new ValidationError(
        'Invalid get_context parameters',
        validators.getContext.errors || undefined
      );
    }
    
    // Additional security validation
    if (typeof sanitized.task === 'string') {
      sanitized.task = SecurityValidator.sanitizeInput(sanitized.task);
    }
    
    return sanitized;
  }
  
  static validateSyncRepository(input: any): any {
    const sanitized = this.sanitizeBasicInput(input) as any;
    
    if (!validators.syncRepository(sanitized)) {
      throw new ValidationError(
        'Invalid sync_repository parameters',
        validators.syncRepository.errors || undefined
      );
    }
    
    return sanitized;
  }
  
  static validateRepositoryConfig(input: any): any {
    const sanitized = this.sanitizeBasicInput(input) as any;
    
    if (!validators.repositoryConfig(sanitized)) {
      throw new ValidationError(
        'Invalid repository configuration',
        validators.repositoryConfig.errors || undefined
      );
    }
    
    // Additional security validation
    if (typeof sanitized.url === 'string') {
      SecurityValidator.validateRepositoryUrl(sanitized.url);
    }
    
    return sanitized;
  }
  
  static validateConfig(input: any): any {
    const sanitized = this.sanitizeBasicInput(input) as any;
    
    if (!validators.config(sanitized)) {
      throw new ValidationError(
        'Invalid configuration',
        validators.config.errors || undefined
      );
    }
    
    // Validate each repository
    if (Array.isArray(sanitized.repositories)) {
      sanitized.repositories = sanitized.repositories.map((repo: any) => 
        this.validateRepositoryConfig(repo)
      );
    }
    
    return sanitized;
  }
  
  private static sanitizeBasicInput(input: any): any {
    if (input === null || input === undefined) {
      return {};
    }
    
    if (typeof input !== 'object') {
      throw new ValidationError('Input must be an object');
    }
    
    // Deep clone to avoid modifying original
    const cloned = JSON.parse(JSON.stringify(input));
    
    // Remove any __proto__ pollution attempts
    delete cloned.__proto__;
    delete cloned.constructor;
    delete cloned.prototype;
    
    // Recursively sanitize string values
    this.sanitizeStrings(cloned);
    
    return cloned;
  }
  
  private static sanitizeStrings(obj: any): void {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (typeof obj[key] === 'string') {
          // Remove HTML tags
          obj[key] = obj[key].replace(/<[^>]*>/g, '');
          // Apply additional security sanitization
          obj[key] = SecurityValidator.sanitizeInput(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.sanitizeStrings(obj[key]);
        }
      }
    }
  }
  
  static validateMCPRequest(method: string, params: any): any {
    switch (method) {
      case 'search_docs':
        return this.validateSearchDocs(params);
      case 'get_context':
        return this.validateGetContext(params);
      case 'list_repos':
        return {}; // No parameters
      case 'sync_repository':
        return this.validateSyncRepository(params);
      default:
        throw new ValidationError(`Unknown method: ${method}`);
    }
  }
}