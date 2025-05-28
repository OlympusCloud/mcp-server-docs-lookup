import { MCPServer } from '../../src/server';
import { APIServer } from '../../src/api-server';
import { GitSyncService } from '../../src/services/git-sync';
import { authService } from '../../src/middleware/auth';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock the embedding service to avoid ESM import issues
jest.mock('../../src/services/embedding', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    cleanup: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('End-to-End Workflow Tests', () => {
  let mcpServer: MCPServer;
  let apiServer: APIServer;
  let apiKey: string;
  let app: any;

  beforeAll(async () => {
    // Setup test environment
    process.env.NODE_ENV = 'test';
    
    // Generate API key
    const keyData = authService.generateApiKey('e2e-test', 'admin', ['*']);
    apiKey = keyData.key;

    // Start servers
    mcpServer = new MCPServer();
    await mcpServer.initialize();

    apiServer = new APIServer();
    await apiServer.initialize();
    app = (apiServer as any).app;

    // Create test repository structure
    await setupTestRepository();
  });

  afterAll(async () => {
    await cleanupTestRepository();
    await mcpServer.stop();
    await apiServer.stop();
  });

  async function setupTestRepository() {
    const testRepoPath = path.join(__dirname, '../../test-repo');
    
    // Create test documentation files
    await fs.mkdir(path.join(testRepoPath, 'docs'), { recursive: true });
    
    await fs.writeFile(
      path.join(testRepoPath, 'docs', 'getting-started.md'),
      `# Getting Started

Welcome to our documentation!

## Installation

To install the package, run:

\`\`\`bash
npm install our-package
\`\`\`

## Quick Start

Here's a simple example:

\`\`\`javascript
const pkg = require('our-package');
pkg.init();
\`\`\`
`
    );

    await fs.writeFile(
      path.join(testRepoPath, 'docs', 'api-reference.md'),
      `# API Reference

## Authentication

Our API uses token-based authentication.

### Getting a Token

POST /api/auth/token

Request:
\`\`\`json
{
  "username": "user",
  "password": "pass"
}
\`\`\`

Response:
\`\`\`json
{
  "token": "jwt-token"
}
\`\`\`

## Endpoints

### GET /api/users

Returns a list of users.

### POST /api/users

Creates a new user.
`
    );

    // Initialize git repo
    const { execSync } = require('child_process');
    execSync('git init', { cwd: testRepoPath });
    execSync('git add .', { cwd: testRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath });
  }

  async function cleanupTestRepository() {
    const testRepoPath = path.join(__dirname, '../../test-repo');
    await fs.rm(testRepoPath, { recursive: true, force: true });
  }

  describe('Complete Documentation Workflow', () => {
    it('should sync repository and index documents', async () => {
      // Step 1: Add repository via API
      const addRepoResponse = await request(app)
        .post('/api/repos')
        .set('X-API-Key', apiKey)
        .send({
          name: 'test-repo',
          url: path.join(__dirname, '../../test-repo'),
          branch: 'main',
          patterns: ['**/*.md'],
          category: 'test',
          priority: 1,
        })
        .expect(200);

      expect(addRepoResponse.body).toMatchObject({
        success: true,
        repository: expect.objectContaining({
          name: 'test-repo',
        }),
      });

      // Step 2: Trigger sync
      const syncResponse = await request(app)
        .post('/api/repos/sync')
        .set('X-API-Key', apiKey)
        .send({ repository: 'test-repo' })
        .expect(200);

      expect(syncResponse.body).toMatchObject({
        success: true,
        message: expect.stringContaining('started'),
      });

      // Wait for sync to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Check repository status
      const statusResponse = await request(app)
        .get('/api/repos/status')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(statusResponse.body.repositories).toContainEqual(
        expect.objectContaining({
          name: 'test-repo',
          status: 'synced',
          documentCount: expect.any(Number),
        })
      );
    });

    it('should search indexed documentation', async () => {
      // Search for installation instructions
      const searchResponse = await request(app)
        .post('/api/search')
        .set('X-API-Key', apiKey)
        .send({
          query: 'installation npm install',
          limit: 5,
        })
        .expect(200);

      expect(searchResponse.body.results).toContainEqual(
        expect.objectContaining({
          content: expect.stringContaining('npm install'),
          metadata: expect.objectContaining({
            filepath: expect.stringContaining('getting-started.md'),
          }),
        })
      );
    });

    it('should generate context for coding tasks', async () => {
      // Generate context for authentication implementation
      const contextResponse = await request(app)
        .post('/api/context/generate')
        .set('X-API-Key', apiKey)
        .send({
          task: 'implement user authentication with tokens',
          filters: {
            repository: 'test-repo',
          },
          maxTokens: 4000,
        })
        .expect(200);

      expect(contextResponse.body).toMatchObject({
        content: expect.stringContaining('authentication'),
        metadata: {
          sources: expect.arrayContaining([
            expect.objectContaining({
              filepath: expect.stringContaining('api-reference.md'),
            }),
          ]),
          totalChunks: expect.any(Number),
          tokensUsed: expect.any(Number),
        },
      });

      // Content should include relevant API documentation
      expect(contextResponse.body.content).toContain('POST /api/auth/token');
      expect(contextResponse.body.content).toContain('token-based authentication');
    });

    it('should work with MCP protocol', async () => {
      // Use MCP server to search documentation
      const mcpRequest = {
        id: 'e2e-1',
        method: 'tools/invoke',
        params: {
          name: 'search_documentation',
          input: {
            query: 'authentication token',
            repositories: ['test-repo'],
            limit: 3,
          },
        },
      };

      const mcpResponse = await mcpServer.handleRequest(mcpRequest);

      expect(mcpResponse).toMatchObject({
        id: 'e2e-1',
        result: expect.objectContaining({
          content: expect.stringContaining('Authentication'),
          metadata: expect.objectContaining({
            totalResults: expect.any(Number),
            repositories: ['test-repo'],
          }),
        }),
      });
    });

    it('should handle progressive context generation', async () => {
      // Get overview level context
      const overviewResponse = await request(app)
        .post('/api/context/progressive')
        .set('X-API-Key', apiKey)
        .send({
          task: 'understand the API structure',
          level: 'overview',
        })
        .expect(200);

      expect(overviewResponse.body).toMatchObject({
        level: 'overview',
        chunks: expect.any(Array),
        hasMore: true,
        nextLevel: 'detailed',
      });

      expect(overviewResponse.body.chunks).toHaveLength(3); // Overview limit

      // Get detailed level context
      const detailedResponse = await request(app)
        .post('/api/context/progressive')
        .set('X-API-Key', apiKey)
        .send({
          task: 'understand the API structure',
          level: 'detailed',
        })
        .expect(200);

      expect(detailedResponse.body.chunks.length).toBeGreaterThan(
        overviewResponse.body.chunks.length
      );
    });

    it('should track metrics throughout workflow', async () => {
      // Get metrics after workflow
      const metricsResponse = await request(app)
        .get('/metrics')
        .set('X-API-Key', apiKey)
        .expect(200);

      const metrics = metricsResponse.text;

      // Verify key metrics are tracked
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('vector_search_duration');
      expect(metrics).toContain('context_generation_duration');
      expect(metrics).toContain('documents_indexed_total');
      expect(metrics).toContain('git_sync_duration');
    });

    it('should handle webhook updates', async () => {
      // Simulate GitHub webhook
      const webhookResponse = await request(app)
        .post('/api/webhooks/github')
        .set('X-API-Key', apiKey)
        .set('X-GitHub-Event', 'push')
        .send({
          repository: {
            name: 'test-repo',
            full_name: 'org/test-repo',
          },
          ref: 'refs/heads/main',
          commits: [
            {
              id: 'abc123',
              message: 'Update documentation',
              modified: ['docs/api-reference.md'],
            },
          ],
        })
        .expect(200);

      expect(webhookResponse.body).toMatchObject({
        success: true,
        message: expect.stringContaining('processed'),
      });
    });

    it('should support templated context generation', async () => {
      const templateResponse = await request(app)
        .post('/api/context/generate-templated')
        .set('X-API-Key', apiKey)
        .send({
          task: 'create API client implementation',
          template: 'code-implementation',
          maxResults: 5,
        })
        .expect(200);

      expect(templateResponse.body).toMatchObject({
        content: expect.stringContaining('## Task'),
        metadata: expect.objectContaining({
          template: 'code-implementation',
        }),
      });

      // Should format content according to template
      expect(templateResponse.body.content).toContain('## Relevant Documentation');
      expect(templateResponse.body.content).toContain('## Implementation Notes');
    });
  });

  describe('Error Recovery', () => {
    it('should recover from failed sync operations', async () => {
      // Simulate a failed sync by using invalid repository
      await request(app)
        .post('/api/repos/sync')
        .set('X-API-Key', apiKey)
        .send({ repository: 'invalid-repo' })
        .expect(404);

      // System should still be operational
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('healthy');
    });

    it('should handle rate limiting gracefully', async () => {
      const limitedKey = authService.generateApiKey('limited', 'user', ['read']);

      // Make rapid requests
      const promises = Array(20).fill(null).map(() =>
        request(app)
          .post('/api/search')
          .set('X-API-Key', limitedKey.key)
          .send({ query: 'test' })
      );

      const results = await Promise.all(promises);
      const rateLimited = results.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
      
      // Verify rate limit headers
      const limitedResponse = rateLimited[0];
      expect(limitedResponse.headers).toHaveProperty('x-ratelimit-limit');
      expect(limitedResponse.headers).toHaveProperty('x-ratelimit-reset');
    });
  });
});