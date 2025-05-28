import { MCPServer } from '../../src/server';
import { MCPRequest, MCPResponse } from '../../src/types/mcp';

// Mock the embedding service to avoid ESM import issues
jest.mock('../../src/services/embedding', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    cleanup: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe('MCP Server Integration Tests', () => {
  let server: MCPServer;

  beforeAll(async () => {
    server = new MCPServer();
    await server.initialize();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Protocol Initialization', () => {
    it('should handle initialize request', async () => {
      const request: MCPRequest = {
        id: '1',
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toMatchObject({
        id: '1',
        result: {
          serverInfo: {
            name: expect.any(String),
            version: expect.any(String),
          },
          capabilities: {
            tools: true,
          },
        },
      });
    });
  });

  describe('Tools', () => {
    it('should list available tools', async () => {
      const request: MCPRequest = {
        id: '2',
        method: 'tools/list',
        params: {},
      };

      const response = await server.handleRequest(request);

      expect(response).toMatchObject({
        id: '2',
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'search_documentation',
              description: expect.any(String),
              inputSchema: expect.any(Object),
            }),
            expect.objectContaining({
              name: 'get_repository_status',
              description: expect.any(String),
              inputSchema: expect.any(Object),
            }),
            expect.objectContaining({
              name: 'sync_repository',
              description: expect.any(String),
              inputSchema: expect.any(Object),
            }),
          ]),
        },
      });
    });

    it('should invoke search_documentation tool', async () => {
      const request: MCPRequest = {
        id: '3',
        method: 'tools/invoke',
        params: {
          name: 'search_documentation',
          input: {
            query: 'authentication',
            repositories: ['test-repo'],
            limit: 5,
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toMatchObject({
        id: '3',
        result: expect.objectContaining({
          content: expect.any(String),
          metadata: expect.objectContaining({
            totalResults: expect.any(Number),
            repositories: expect.any(Array),
          }),
        }),
      });
    });

    it('should invoke get_repository_status tool', async () => {
      const request: MCPRequest = {
        id: '4',
        method: 'tools/invoke',
        params: {
          name: 'get_repository_status',
          input: {},
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toMatchObject({
        id: '4',
        result: expect.objectContaining({
          repositories: expect.any(Array),
          totalDocuments: expect.any(Number),
          totalChunks: expect.any(Number),
          lastSync: expect.any(String),
        }),
      });
    });

    it('should handle tool invocation errors', async () => {
      const request: MCPRequest = {
        id: '5',
        method: 'tools/invoke',
        params: {
          name: 'nonexistent_tool',
          input: {},
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toMatchObject({
        id: '5',
        error: expect.objectContaining({
          code: expect.any(Number),
          message: expect.stringContaining('Unknown tool'),
        }),
      });
    });

    it('should validate tool input', async () => {
      const request: MCPRequest = {
        id: '6',
        method: 'tools/invoke',
        params: {
          name: 'search_documentation',
          input: {
            // Missing required 'query' field
            limit: 5,
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toMatchObject({
        id: '6',
        error: expect.objectContaining({
          code: expect.any(Number),
          message: expect.any(String),
        }),
      });
    });
  });

  describe('Repository Sync', () => {
    it('should sync repository with valid config', async () => {
      const request: MCPRequest = {
        id: '7',
        method: 'tools/invoke',
        params: {
          name: 'sync_repository',
          input: {
            repository: 'test-repo',
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toMatchObject({
        id: '7',
        result: expect.objectContaining({
          success: expect.any(Boolean),
          message: expect.any(String),
        }),
      });
    });

    it('should handle sync errors gracefully', async () => {
      const request: MCPRequest = {
        id: '8',
        method: 'tools/invoke',
        params: {
          name: 'sync_repository',
          input: {
            repository: 'nonexistent-repo',
          },
        },
      };

      const response = await server.handleRequest(request);

      expect(response).toMatchObject({
        id: '8',
        result: expect.objectContaining({
          success: false,
          error: expect.stringContaining('not found'),
        }),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests', async () => {
      const request = {
        // Missing required 'id' field
        method: 'tools/list',
      } as MCPRequest;

      const response = await server.handleRequest(request);

      expect(response).toHaveProperty('error');
    });

    it('should handle unknown methods', async () => {
      const request: MCPRequest = {
        id: '9',
        method: 'unknown/method',
        params: {},
      };

      const response = await server.handleRequest(request);

      expect(response).toMatchObject({
        id: '9',
        error: expect.objectContaining({
          code: -32601, // Method not found
          message: expect.any(String),
        }),
      });
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple simultaneous requests', async () => {
      const requests: MCPRequest[] = Array(10).fill(null).map((_, i) => ({
        id: `concurrent-${i}`,
        method: 'tools/invoke',
        params: {
          name: 'search_documentation',
          input: {
            query: `test query ${i}`,
            limit: 3,
          },
        },
      }));

      const responses = await Promise.all(
        requests.map(req => server.handleRequest(req))
      );

      responses.forEach((response, i) => {
        expect(response).toMatchObject({
          id: `concurrent-${i}`,
          result: expect.any(Object),
        });
      });
    });
  });
});