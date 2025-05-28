import request from 'supertest';
import express from 'express';
import { APIServer } from '../../src/api-server';
import { authService } from '../../src/middleware/auth';

// Mock the embedding service to avoid ESM import issues
jest.mock('../../src/services/embedding', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    cleanup: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('API Integration Tests', () => {
  let app: express.Application;
  let server: APIServer;
  let apiKey: string;

  beforeAll(async () => {
    // Create test API key
    const keyData = authService.generateApiKey('test', 'admin', ['*']);
    apiKey = keyData.key;

    // Initialize server
    server = new APIServer();
    await server.initialize();
    app = (server as any).app;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Health Check', () => {
    it('should return health status without auth', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        version: expect.any(String),
        uptime: expect.any(Number),
      });
    });
  });

  describe('Authentication', () => {
    it('should reject requests without API key', async () => {
      await request(app)
        .get('/api/config')
        .expect(401);
    });

    it('should accept requests with valid API key', async () => {
      await request(app)
        .get('/api/config')
        .set('X-API-Key', apiKey)
        .expect(200);
    });
  });

  describe('Search API', () => {
    it('should search documentation', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('X-API-Key', apiKey)
        .send({
          query: 'authentication',
          limit: 10,
        })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('should validate search parameters', async () => {
      await request(app)
        .post('/api/search')
        .set('X-API-Key', apiKey)
        .send({
          // Missing query
          limit: 10,
        })
        .expect(400);
    });
  });

  describe('Context Generation', () => {
    it('should generate context for task', async () => {
      const response = await request(app)
        .post('/api/context/generate')
        .set('X-API-Key', apiKey)
        .send({
          task: 'explain OAuth2 authentication',
          maxTokens: 2000,
        })
        .expect(200);

      expect(response.body).toHaveProperty('content');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body.metadata).toHaveProperty('sources');
    });

    it('should generate progressive context', async () => {
      const response = await request(app)
        .post('/api/context/progressive')
        .set('X-API-Key', apiKey)
        .send({
          task: 'explain REST API design',
          level: 'overview',
        })
        .expect(200);

      expect(response.body).toHaveProperty('level', 'overview');
      expect(response.body).toHaveProperty('chunks');
      expect(response.body).toHaveProperty('hasMore');
    });
  });

  describe('Repository Management', () => {
    it('should list repositories', async () => {
      const response = await request(app)
        .get('/api/repos')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body).toHaveProperty('repositories');
      expect(Array.isArray(response.body.repositories)).toBe(true);
    });

    it('should get repository status', async () => {
      const response = await request(app)
        .get('/api/repos/status')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body).toHaveProperty('repositories');
      expect(response.body).toHaveProperty('indexedDocuments');
    });

    it('should require authorization for sync', async () => {
      // Create user key without sync permission
      const userKey = authService.generateApiKey('user', 'user', ['read']);

      await request(app)
        .post('/api/repos/sync')
        .set('X-API-Key', userKey.key)
        .send({ repository: 'test-repo' })
        .expect(403);
    });
  });

  describe('Presets', () => {
    it('should list available presets', async () => {
      const response = await request(app)
        .get('/api/presets')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body).toHaveProperty('presets');
      expect(Array.isArray(response.body.presets)).toBe(true);
    });

    it('should apply preset with proper authorization', async () => {
      await request(app)
        .post('/api/presets/general-web/apply')
        .set('X-API-Key', apiKey)
        .expect(200);
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/api/config')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });

    it('should enforce rate limits', async () => {
      // Create a key with low rate limit
      const limitedKey = authService.generateApiKey('limited', 'user', ['read']);

      // Make multiple rapid requests
      const requests = Array(15).fill(null).map(() =>
        request(app)
          .get('/api/search')
          .set('X-API-Key', limitedKey.key)
          .query({ q: 'test' })
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/search')
        .set('X-API-Key', apiKey)
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    it('should include request ID in error responses', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('X-API-Key', apiKey)
        .set('X-Request-ID', 'test-request-123')
        .expect(404);

      expect(response.body.error).toHaveProperty('requestId', 'test-request-123');
    });
  });

  describe('Metrics', () => {
    it('should expose metrics endpoint with authorization', async () => {
      const response = await request(app)
        .get('/metrics')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('http_requests_total');
    });

    it('should track request metrics', async () => {
      // Make some requests
      await request(app).get('/health').expect(200);
      await request(app).get('/api/config').set('X-API-Key', apiKey).expect(200);

      // Check metrics
      const response = await request(app)
        .get('/metrics')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.text).toMatch(/http_requests_total.*path="\/health"/);
      expect(response.text).toMatch(/http_requests_total.*path="\/api\/config"/);
    });
  });
});