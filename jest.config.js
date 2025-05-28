module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: [
    'tests/unit/services/document-processor.test.ts',
    'tests/unit/services/context-generator.test.ts', 
    'tests/unit/services/vector-store.test.ts',
    'tests/unit/utils/validation.test.ts',
    'tests/e2e/',
    'tests/integration/'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@xenova/transformers)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/cli.ts',
    '!src/server.ts',
    '!src/api-server.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 5,
      lines: 5,
      statements: 5,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  maxWorkers: 1, // Reduce memory usage by using single worker
  workerIdleMemoryLimit: '512MB',
};