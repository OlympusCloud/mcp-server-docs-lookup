import { jest } from '@jest/globals';
import { beforeAll, afterAll, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.TEST_DATA_DIR = path.join(__dirname, 'test-data');

// Create test data directory
if (!fs.existsSync(process.env.TEST_DATA_DIR)) {
  fs.mkdirSync(process.env.TEST_DATA_DIR, { recursive: true });
}

// Mock external dependencies
jest.mock('isomorphic-git');
jest.mock('@xenova/transformers');
jest.mock('@qdrant/js-client-rest');

// Mock logger to reduce console spam
jest.mock('../src/utils/logger', () => ({
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
}));

// Global test utilities
global.testUtils = {
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  createMockRepository() {
    return {
      name: 'test-repo',
      url: 'https://github.com/test/repo.git',
      branch: 'main',
      patterns: ['**/*.md'],
      category: 'test',
      priority: 1,
    };
  },
  
  createMockDocument() {
    return {
      id: 'test-doc-1',
      content: 'Test document content',
      metadata: {
        filepath: '/test/doc.md',
        repository: 'test-repo',
        branch: 'main',
        title: 'Test Document',
        category: 'test',
      },
    };
  },
  
  createMockChunk() {
    return {
      id: 'chunk-1',
      content: 'Test chunk content',
      embedding: new Array(384).fill(0.1),
      metadata: {
        documentId: 'test-doc-1',
        filepath: '/test/doc.md',
        repository: 'test-repo',
        startLine: 1,
        endLine: 5,
        section: 'Introduction',
      },
    };
  },
};

// Setup test database
beforeAll(async () => {
  // Initialize test database connections
});

// Cleanup after tests
afterAll(async () => {
  // Close connections
});

// Reset mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});