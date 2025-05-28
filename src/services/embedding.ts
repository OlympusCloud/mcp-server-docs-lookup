import { pipeline, env } from '@xenova/transformers';
import logger from '../utils/logger';
import { EmbeddingError } from '../utils/errors';
import { DocumentChunk } from '../types/document';

export enum EmbeddingProvider {
  LOCAL = 'local',
  OPENAI = 'openai',
  GOOGLE = 'google',
  AZURE = 'azure'
}

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  batchSize?: number;
  cacheEnabled?: boolean;
}

export abstract class BaseEmbeddingService {
  protected config: EmbeddingConfig;
  protected cache: Map<string, number[]>;

  constructor(config: EmbeddingConfig) {
    this.config = {
      batchSize: 100,
      cacheEnabled: true,
      ...config
    };
    this.cache = new Map();
  }

  abstract generateEmbedding(text: string): Promise<number[]>;
  abstract generateBatchEmbeddings(texts: string[]): Promise<number[][]>;

  protected getCacheKey(text: string): string {
    return `${this.config.provider}:${this.config.model}:${text.substring(0, 100)}`;
  }

  protected getCachedEmbedding(text: string): number[] | null {
    if (!this.config.cacheEnabled) return null;
    
    const key = this.getCacheKey(text);
    return this.cache.get(key) || null;
  }

  protected setCachedEmbedding(text: string, embedding: number[]): void {
    if (!this.config.cacheEnabled) return;
    
    const key = this.getCacheKey(text);
    this.cache.set(key, embedding);

    if (this.cache.size > 10000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  async generateChunkEmbeddings(chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
    const texts = chunks.map(chunk => this.prepareTextForEmbedding(chunk));
    const embeddings = await this.generateBatchEmbeddings(texts);

    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index]
    }));
  }

  protected prepareTextForEmbedding(chunk: DocumentChunk): string {
    const parts = [];

    if (chunk.metadata.title) {
      parts.push(`Title: ${chunk.metadata.title}`);
    }

    if (chunk.filepath) {
      parts.push(`File: ${chunk.filepath}`);
    }

    if (chunk.type === 'heading') {
      parts.push(`Section: ${chunk.content}`);
    } else {
      parts.push(chunk.content);
    }

    if (chunk.metadata.tags?.length) {
      parts.push(`Tags: ${chunk.metadata.tags.join(', ')}`);
    }

    return parts.join('\n');
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Embedding cache cleared');
  }
}

export class LocalEmbeddingService extends BaseEmbeddingService {
  private model: any;
  private modelName: string;
  private initialized: boolean = false;

  constructor(config: EmbeddingConfig) {
    super(config);
    this.modelName = config.model || 'Xenova/all-MiniLM-L6-v2';
    
    (env as any).localURL = './models/';
    (env as any).allowRemoteModels = true;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info(`Loading local embedding model: ${this.modelName}`);
      this.model = await pipeline('feature-extraction', this.modelName);
      this.initialized = true;
      logger.info('Local embedding model loaded successfully');
    } catch (error) {
      throw new EmbeddingError('Failed to load local embedding model', { 
        model: this.modelName,
        error 
      });
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const cached = this.getCachedEmbedding(text);
    if (cached) return cached;

    await this.initialize();

    try {
      const output = await this.model(text, { 
        pooling: 'mean',
        normalize: true 
      });
      
      const embedding = Array.from(output.data as Float32Array);
      this.setCachedEmbedding(text, embedding);
      
      return embedding;
    } catch (error) {
      throw new EmbeddingError('Failed to generate embedding', { error });
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    await this.initialize();

    const embeddings: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    texts.forEach((text, index) => {
      const cached = this.getCachedEmbedding(text);
      if (cached) {
        embeddings[index] = cached;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(index);
      }
    });

    if (uncachedTexts.length === 0) {
      return embeddings;
    }

    try {
      for (let i = 0; i < uncachedTexts.length; i += this.config.batchSize!) {
        const batch = uncachedTexts.slice(i, i + this.config.batchSize!);
        
        const outputs = await Promise.all(
          batch.map(text => this.model(text, { 
            pooling: 'mean',
            normalize: true 
          }))
        );

        outputs.forEach((output, batchIndex) => {
          const embedding = Array.from(output.data as Float32Array);
          const originalIndex = uncachedIndices[i + batchIndex];
          embeddings[originalIndex] = embedding;
          this.setCachedEmbedding(uncachedTexts[i + batchIndex], embedding);
        });

        logger.debug(`Generated embeddings for batch ${i / this.config.batchSize! + 1}`, {
          total: Math.ceil(uncachedTexts.length / this.config.batchSize!)
        });
      }

      return embeddings;
    } catch (error) {
      throw new EmbeddingError('Failed to generate batch embeddings', { error });
    }
  }
}

export class OpenAIEmbeddingService extends BaseEmbeddingService {
  constructor(config: EmbeddingConfig) {
    super(config);
    if (!config.apiKey) {
      throw new EmbeddingError('OpenAI API key is required');
    }
    this.config.model = config.model || 'text-embedding-3-small';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const cached = this.getCachedEmbedding(text);
    if (cached) return cached;

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      const embedding = data.data[0].embedding;
      
      this.setCachedEmbedding(text, embedding);
      return embedding;
    } catch (error) {
      throw new EmbeddingError('Failed to generate OpenAI embedding', { error });
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    texts.forEach((text, index) => {
      const cached = this.getCachedEmbedding(text);
      if (cached) {
        embeddings[index] = cached;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(index);
      }
    });

    if (uncachedTexts.length === 0) {
      return embeddings;
    }

    try {
      for (let i = 0; i < uncachedTexts.length; i += this.config.batchSize!) {
        const batch = uncachedTexts.slice(i, i + this.config.batchSize!);
        
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify({
            model: this.config.model,
            input: batch
          })
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json() as any;
        
        data.data.forEach((item: any, batchIndex: number) => {
          const originalIndex = uncachedIndices[i + batchIndex];
          embeddings[originalIndex] = item.embedding;
          this.setCachedEmbedding(uncachedTexts[i + batchIndex], item.embedding);
        });
      }

      return embeddings;
    } catch (error) {
      throw new EmbeddingError('Failed to generate OpenAI batch embeddings', { error });
    }
  }
}

export class EmbeddingService {
  private service: BaseEmbeddingService;

  constructor(config: EmbeddingConfig) {
    switch (config.provider) {
      case EmbeddingProvider.LOCAL:
        this.service = new LocalEmbeddingService(config);
        break;
      case EmbeddingProvider.OPENAI:
        this.service = new OpenAIEmbeddingService(config);
        break;
      case EmbeddingProvider.GOOGLE:
      case EmbeddingProvider.AZURE:
        throw new EmbeddingError(`${config.provider} provider not yet implemented`);
      default:
        throw new EmbeddingError(`Unknown embedding provider: ${config.provider}`);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.service.generateEmbedding(text);
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return this.service.generateBatchEmbeddings(texts);
  }

  async generateChunkEmbeddings(chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
    return this.service.generateChunkEmbeddings(chunks);
  }

  clearCache(): void {
    this.service.clearCache();
  }
}

export default EmbeddingService;