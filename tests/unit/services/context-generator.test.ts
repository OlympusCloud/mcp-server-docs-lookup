import { ContextGenerator } from '../../../src/services/context-generator';
import { VectorStore } from '../../../src/services/vector-store';
import { EmbeddingService } from '../../../src/services/embedding';

jest.mock('../../../src/services/vector-store');
jest.mock('../../../src/services/embedding');

describe('ContextGenerator', () => {
  let contextGenerator: ContextGenerator;
  let mockVectorStore: jest.Mocked<VectorStore>;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;

  beforeEach(() => {
    mockVectorStore = {
      search: jest.fn(),
      searchByMetadata: jest.fn(),
    } as any;

    mockEmbeddingService = {
      generateEmbedding: jest.fn(),
    } as any;

    contextGenerator = new ContextGenerator(
      mockVectorStore,
      mockEmbeddingService,
      {
        strategies: ['hybrid'],
        maxChunks: 10,
        priorityWeighting: {
          high: 1.5,
          medium: 1.0,
          low: 0.7
        }
      }
    );
  });

  describe('generateContext', () => {
    it('should generate context from search results', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      const mockSearchResults = [
        {
          chunk: {
            id: 'chunk-1',
            documentId: 'doc-1',
            content: 'Test content 1',
            type: 'paragraph' as const,
            filepath: '/test1.md',
            repository: 'test-repo',
            metadata: {
              filepath: '/test1.md',
              section: 'Introduction',
              repository: 'test-repo',
            },
            hash: 'hash1',
          },
          score: 0.95,
        },
        {
          chunk: {
            id: 'chunk-2',
            documentId: 'doc-2',
            content: 'Test content 2',
            type: 'paragraph' as const,
            filepath: '/test2.md',
            repository: 'test-repo',
            metadata: {
              filepath: '/test2.md',
              section: 'Details',
              repository: 'test-repo',
            },
            hash: 'hash2',
          },
          score: 0.85,
        },
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue(mockSearchResults);

      const context = await contextGenerator.generateContext({
        task: 'explain authentication',
        repositories: ['test-repo'],
      });

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('explain authentication');
      expect(mockVectorStore.search).toHaveBeenCalledWith(
        mockEmbedding,
        expect.objectContaining({
          scoreThreshold: 0.7,
          filter: {
            must: [
              {
                key: 'metadata.repository',
                match: { value: 'test-repo' },
              },
            ],
          },
        })
      );

      expect(context.content).toContain('Test content 1');
      expect(context.content).toContain('Test content 2');
      expect(context.metadata.sources).toHaveLength(2);
      expect(context.metadata.totalChunks).toBe(2);
    });

    it('should respect token limits', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      const longContent = 'A'.repeat(1000);
      const mockSearchResults = Array(20).fill(null).map((_, i) => ({
        chunk: {
          id: `chunk-${i}`,
          documentId: `doc-${i}`,
          content: longContent,
          type: 'paragraph' as const,
          filepath: `/test${i}.md`,
          repository: 'test-repo',
          metadata: {
            filepath: `/test${i}.md`,
            section: `Section ${i}`,
            repository: 'test-repo',
          },
          hash: `hash${i}`,
        },
        score: 0.9 - i * 0.01,
      }));

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue(mockSearchResults);

      const context = await contextGenerator.generateContext({
        task: 'test query',
        maxResults: 5,
      });

      // Should include fewer chunks due to token limit
      expect(context.metadata.totalChunks).toBeLessThan(20);
      expect(context.content.length).toBeLessThan(2000 * 4); // Rough token estimate
    });

    it('should generate progressive context', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      const mockSearchResults = Array(15).fill(null).map((_, i) => ({
        chunk: {
          id: `chunk-${i}`,
          documentId: `doc-${i}`,
          content: `Content ${i}`,
          type: 'paragraph' as const,
          filepath: `/test${i}.md`,
          repository: 'test-repo',
          metadata: {
            filepath: `/test${i}.md`,
            section: `Section ${i}`,
            repository: 'test-repo',
          },
          hash: `hash${i}`,
        },
        score: 0.95 - i * 0.02,
      }));

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue(mockSearchResults);

      const context = await contextGenerator.generateProgressiveContext({
        task: 'test query',
        maxResults: 3,
      });

      expect(context).toBeDefined();
      expect(context.overview).toBeDefined();
      expect(Array.isArray(context.overview)).toBe(true);
      expect(context.depth).toBeGreaterThanOrEqual(0);
    });

    it('should handle no results', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue([]);

      const context = await contextGenerator.generateContext({
        task: 'nonexistent topic',
      });

      expect(context.content).toBe('');
      expect(context.metadata.sources).toHaveLength(0);
      expect(context.metadata.totalChunks).toBe(0);
    });
  });

  describe('generateStructuredContext', () => {
    it('should organize context by sections', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      const mockSearchResults = [
        {
          chunk: {
            id: 'chunk-1',
            documentId: 'doc-1',
            content: 'Auth content 1',
            type: 'paragraph' as const,
            filepath: '/auth/oauth.md',
            repository: 'test-repo',
            metadata: {
              filepath: '/auth/oauth.md',
              section: 'OAuth2',
              repository: 'test-repo',
            },
            hash: 'hash1',
          },
          score: 0.95,
        },
        {
          chunk: {
            id: 'chunk-2',
            documentId: 'doc-2',
            content: 'Auth content 2',
            type: 'paragraph' as const,
            filepath: '/auth/jwt.md',
            repository: 'test-repo',
            metadata: {
              filepath: '/auth/jwt.md',
              section: 'JWT',
              repository: 'test-repo',
            },
            hash: 'hash2',
          },
          score: 0.90,
        },
        {
          chunk: {
            id: 'chunk-3',
            documentId: 'doc-3',
            content: 'API content',
            type: 'paragraph' as const,
            filepath: '/api/endpoints.md',
            repository: 'test-repo',
            metadata: {
              filepath: '/api/endpoints.md',
              section: 'Endpoints',
              repository: 'test-repo',
            },
            hash: 'hash3',
          },
          score: 0.85,
        },
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue(mockSearchResults);

      const context = await contextGenerator.generateContext({
        task: 'explain authentication',
      });

      expect(context.results).toBeDefined();
      expect(Array.isArray(context.results)).toBe(true);
      expect(context.results.length).toBeGreaterThan(0);
    });
  });

  describe('filters', () => {
    it('should apply multiple filters', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue([]);

      await contextGenerator.generateContext({
        task: 'test query',
        repositories: ['test-repo'],
        categories: ['documentation'],
      });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        mockEmbedding,
        expect.objectContaining({
          filter: {
            must: [
              { key: 'metadata.repository', match: { value: 'test-repo' } },
              { key: 'metadata.category', match: { value: 'documentation' } },
              { key: 'metadata.branch', match: { value: 'main' } },
            ],
          },
        })
      );
    });

    it('should handle pattern-based filters', async () => {
      const mockEmbedding = new Array(384).fill(0.1);
      
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue([]);

      await contextGenerator.generateContext({
        task: 'test query',
      });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        mockEmbedding,
        expect.objectContaining({
          filter: {
            must: [
              { key: 'metadata.filepath', match: { pattern: '/docs/**/*.md' } },
            ],
          },
        })
      );
    });
  });
});