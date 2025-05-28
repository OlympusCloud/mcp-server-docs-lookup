import { VectorStore } from '../../../src/services/vector-store';
import { QdrantClient } from '@qdrant/js-client-rest';
import { DocumentChunk } from '../../../src/types/document';

jest.mock('@qdrant/js-client-rest');

describe('VectorStore', () => {
  let vectorStore: VectorStore;
  let mockQdrantClient: jest.Mocked<QdrantClient>;

  beforeEach(() => {
    mockQdrantClient = {
      getCollections: jest.fn(),
      createCollection: jest.fn(),
      upsert: jest.fn(),
      search: jest.fn(),
      delete: jest.fn(),
      scroll: jest.fn(),
      getCollection: jest.fn(),
      deleteCollection: jest.fn(),
    } as any;

    // Default mock setup - collection exists
    mockQdrantClient.getCollections.mockResolvedValue({
      collections: [{ name: 'test-collection' }],
    });

    mockQdrantClient.upsert.mockResolvedValue({
      operation_id: null,
      status: 'completed'
    });
    mockQdrantClient.search.mockResolvedValue([]);
    mockQdrantClient.delete.mockResolvedValue({
      operation_id: null,
      status: 'completed'
    });
    mockQdrantClient.getCollection.mockResolvedValue({
      status: 'green',
      optimizer_status: 'ok',
      vectors_count: 0,
      indexed_vectors_count: 0,
      points_count: 0,
      segments_count: 1,
      config: {
        params: {
          vectors: {
            size: 384,
            distance: 'Cosine'
          }
        }
      },
      payload_schema: {}
    } as any);

    (QdrantClient as jest.MockedClass<typeof QdrantClient>).mockImplementation(() => mockQdrantClient);

    vectorStore = new VectorStore({
      type: 'qdrant',
      qdrant: {
        url: 'http://localhost:6333',
        collectionName: 'test-collection',
      },
    });
  });

  describe('initialize', () => {
    it('should create collection if it does not exist', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [],
      });

      await vectorStore.initialize();

      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('test-collection', {
        vectors: {
          size: 384,
          distance: 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });
    });

    it('should not create collection if it already exists', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [{ name: 'test-collection' }],
      });

      await vectorStore.initialize();

      expect(mockQdrantClient.createCollection).not.toHaveBeenCalled();
    });
  });

  describe('upsertChunks', () => {
    it('should insert chunks with embeddings', async () => {
      const chunks: DocumentChunk[] = [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          repository: 'test-repo',
          filepath: '/test.md',
          content: 'Test content',
          type: 'paragraph',
          metadata: {
            documentId: 'doc-1',
            filepath: '/test.md',
          },
          embedding: new Array(384).fill(0.1),
          hash: 'test-hash'
        },
      ];

      await vectorStore.upsertChunks(chunks);

      expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test-collection', {
        wait: true,
        points: [
          {
            id: expect.any(String), // UUID format from convertToQdrantId
            vector: chunks[0].embedding,
            payload: {
              originalId: 'chunk-1',
              documentId: 'doc-1',
              repository: 'test-repo',
              filepath: '/test.md',
              content: 'Test content',
              type: 'paragraph',
              metadata: {
                documentId: 'doc-1',
                filepath: '/test.md',
              },
              startLine: undefined,
              endLine: undefined,
              parentChunkId: undefined,
              childChunkIds: undefined,
              hash: 'test-hash',
              priority: 'medium',
            },
          },
        ],
      });
    });

    it('should handle empty chunks array', async () => {
      await vectorStore.upsertChunks([]);
      expect(mockQdrantClient.upsert).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should search with embedding vector', async () => {
      const embedding = new Array(384).fill(0.1);
      const mockResults = [
        {
          id: 'chunk-1',
          version: 0,
          score: 0.95,
          payload: {
            content: 'Test content',
            metadata: { filepath: '/test.md' },
            documentId: 'doc-1',
            repository: 'test-repo',
            filepath: '/test.md',
            type: 'paragraph',
            hash: 'test-hash'
          },
        },
      ];

      mockQdrantClient.search.mockResolvedValue(mockResults);

      const results = await vectorStore.search(embedding, { limit: 10 });

      expect(mockQdrantClient.search).toHaveBeenCalledWith('test-collection', {
        vector: embedding,
        limit: 10,
        with_payload: true,
      });
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.95);
    });

    it('should apply score threshold filter', async () => {
      const embedding = new Array(384).fill(0.1);
      const mockResults = [
        { 
          id: 'chunk-1', 
          version: 0,
          score: 0.95, 
          payload: {
            content: 'Test content 1',
            documentId: 'doc-1',
            repository: 'test-repo',
            filepath: '/test1.md',
            type: 'paragraph',
            hash: 'test-hash-1'
          } 
        },
        { 
          id: 'chunk-2', 
          version: 0,
          score: 0.6, 
          payload: {
            content: 'Test content 2',
            documentId: 'doc-2',
            repository: 'test-repo',
            filepath: '/test2.md',
            type: 'paragraph',
            hash: 'test-hash-2'
          } 
        },
        { 
          id: 'chunk-3', 
          version: 0,
          score: 0.4, 
          payload: {
            content: 'Test content 3',
            documentId: 'doc-3',
            repository: 'test-repo',
            filepath: '/test3.md',
            type: 'paragraph',
            hash: 'test-hash-3'
          } 
        },
      ];

      mockQdrantClient.search.mockResolvedValue(mockResults);

      const results = await vectorStore.search(embedding, {
        limit: 10,
        scoreThreshold: 0.7,
      });

      expect(results).toHaveLength(1);
      expect(results[0].chunk.id).toBe('chunk-1');
    });
  });

  describe('deleteDocument', () => {
    it('should delete all chunks for a document', async () => {
      await vectorStore.deleteByDocument('doc-1');

      expect(mockQdrantClient.delete).toHaveBeenCalledWith('test-collection', {
        wait: true,
        filter: {
          must: [
            {
              key: 'metadata.documentId',
              match: { value: 'doc-1' },
            },
          ],
        },
      });
    });
  });

  describe('getCollectionInfo', () => {
    it('should return collection information', async () => {
      const mockInfo = {
        vectors_count: 1000,
        indexed_vectors_count: 1000,
        points_count: 1000,
        segments_count: 1,
        status: 'green' as const,
        optimizer_status: 'ok' as const,
        config: {
          params: {
            vectors: {
              size: 384,
              distance: 'Cosine' as const
            }
          },
          hnsw_config: {
            m: 16,
            ef_construct: 100,
            full_scan_threshold: 10000
          },
          optimizer_config: {
            deleted_threshold: 0.2,
            vacuum_min_vector_number: 1000,
            default_segment_number: 5,
            max_segment_size: 200000,
            memmap_threshold: 100000,
            indexing_threshold: 20000,
            flush_interval_sec: 5
          },
          wal_config: {
            wal_capacity_mb: 32,
            wal_segments_ahead: 0
          },
          quantization_config: null
        },
        payload_schema: {}
      };

      mockQdrantClient.getCollection.mockResolvedValue(mockInfo);

      const info = await vectorStore.getCollectionInfo('test-collection');

      expect(info).toEqual(mockInfo);
    });
  });
});