import { Plugin, DocumentProcessorPlugin, ContextGeneratorPlugin } from './plugin-manager';
import { Document, DocumentChunk } from '../types/document';
import * as crypto from 'crypto';

/**
 * Example plugin that adds support for:
 * 1. Processing .env files
 * 2. Enhancing context with environment-specific information
 */

const envFileProcessor: DocumentProcessorPlugin = {
  fileTypes: ['.env', '.env.example', '.env.local'],
  
  async process(document: Document): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    const lines = document.content.split('\n');
    
    let currentChunk: string[] = [];
    let currentCategory = 'general';
    
    for (const line of lines) {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) {
        if (line.trim().startsWith('# Category:')) {
          currentCategory = line.replace('# Category:', '').trim();
        }
        continue;
      }
      
      // Parse environment variable
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        currentChunk.push(`${key}=${value.includes('secret') ? '***' : value}`);
      }
      
      // Create chunk every 10 variables
      if (currentChunk.length >= 10) {
        chunks.push(createChunk(
          document,
          currentChunk.join('\n'),
          currentCategory
        ));
        currentChunk = [];
      }
    }
    
    // Add remaining variables
    if (currentChunk.length > 0) {
      chunks.push(createChunk(
        document,
        currentChunk.join('\n'),
        currentCategory
      ));
    }
    
    return chunks;
  }
};

const environmentContextEnhancer: ContextGeneratorPlugin = {
  name: 'environment-enhancer',
  strategies: ['hybrid', 'keyword'],
  
  async generate(query: any, chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
    // If query mentions environment or config, boost .env file chunks
    const envKeywords = ['environment', 'config', 'variable', 'env', 'setting'];
    const queryLower = query.task.toLowerCase();
    
    const mentionsEnv = envKeywords.some(keyword => queryLower.includes(keyword));
    
    if (!mentionsEnv) {
      return chunks;
    }
    
    // Boost scores for environment-related chunks
    return chunks.map(chunk => {
      if (chunk.filepath.includes('.env') || 
          chunk.metadata.category === 'configuration') {
        return {
          ...chunk,
          score: (chunk.score || 0) * 1.5,
          relevanceExplanation: 
            (chunk.relevanceExplanation || '') + '; Environment configuration'
        };
      }
      return chunk;
    });
  }
};

function createChunk(
  document: Document,
  content: string,
  category: string
): DocumentChunk {
  const chunkId = crypto
    .createHash('sha256')
    .update(`${document.id}_${content}`)
    .digest('hex')
    .substring(0, 16);
    
  return {
    id: chunkId,
    documentId: document.id,
    repository: document.repository,
    filepath: document.filepath,
    content,
    type: 'other',
    metadata: {
      ...document.metadata,
      category,
      fileType: 'environment'
    },
    hash: crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16)
  };
}

const examplePlugin: Plugin = {
  name: 'example-env-plugin',
  version: '1.0.0',
  description: 'Example plugin for processing environment files',
  
  processors: [envFileProcessor],
  contextGenerators: [environmentContextEnhancer],
  
  async init(config: any): Promise<void> {
    console.log('Example plugin initialized with config:', config);
  },
  
  async destroy(): Promise<void> {
    console.log('Example plugin destroyed');
  }
};

export default examplePlugin;