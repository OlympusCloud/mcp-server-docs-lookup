import { Router, Request, Response } from 'express';
import { VectorStore } from '../services/vector-store';
import { EmbeddingService } from '../services/embedding';
import { SimpleSearch } from '../services/simple-search';
import logger from '../utils/logger';

export default function createSearchRoutes(
  vectorStore: VectorStore,
  embeddingService: EmbeddingService
): Router {
  const router = Router();
  const simpleSearch = new SimpleSearch();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const { q, category, repository, type, limit } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          error: 'Query parameter q is required'
        });
      }

      const embedding = await embeddingService.generateEmbedding(q);
      
      const filter: Record<string, any> = {};
      if (category) filter['metadata.category'] = category;
      if (repository) filter.repository = repository;
      if (type) filter.type = type;

      try {
        const results = await vectorStore.search(embedding, {
          limit: limit ? parseInt(limit as string) : 20,
          filter
        });

        return res.json({
          query: q,
          results: results.map(result => ({
            content: result.chunk.content,
            repository: result.chunk.repository,
            filepath: result.chunk.filepath,
            type: result.chunk.type,
            score: result.score,
            metadata: result.chunk.metadata
          })),
          total: results.length,
          strategy: 'vector'
        });
      } catch (vectorError) {
        // Fallback to simple text search
        logger.warn('Vector search failed, using simple search fallback', { vectorError });
        
        const simpleResults = simpleSearch.searchDocuments(q, limit ? parseInt(limit as string) : 20);
        
        return res.json({
          query: q,
          results: simpleResults.map(result => ({
            content: result.content,
            repository: result.repository,
            filepath: result.file,
            type: 'text',
            score: 1.0,
            metadata: {
              line: result.line,
              context: result.context
            }
          })),
          total: simpleResults.length,
          strategy: 'simple_text'
        });
      }
    } catch (error) {
      logger.error('Search failed completely', { error });
      return res.status(500).json({
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/metadata', async (req: Request, res: Response) => {
    try {
      const filter: Record<string, any> = {};
      
      Object.entries(req.query).forEach(([key, value]) => {
        if (value && typeof value === 'string') {
          filter[key] = value;
        }
      });

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const chunks = await vectorStore.searchByMetadata(filter, limit);

      return res.json({
        filter,
        results: chunks.map(chunk => ({
          id: chunk.id,
          repository: chunk.repository,
          filepath: chunk.filepath,
          type: chunk.type,
          metadata: chunk.metadata
        })),
        total: chunks.length
      });
    } catch (error) {
      logger.error('Metadata search failed', { error });
      return res.status(500).json({
        error: 'Metadata search failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await vectorStore.getStats();
      return res.json(stats);
    } catch (error) {
      logger.error('Failed to get search stats', { error });
      return res.status(500).json({
        error: 'Failed to get search stats',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

