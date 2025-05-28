import { DocumentChunk } from './document';

export interface ContextChunk extends Omit<DocumentChunk, 'documentId' | 'hash'> {
  score: number;
  relevanceExplanation?: string;
}

export interface ContextMetadata {
  sources: Array<{
    filepath: string;
    repository: string;
    relevance: number;
  }>;
  totalChunks: number;
  tokensUsed: number;
  strategy: string;
  timestamp: Date;
  totalResults?: number;
  searchTime?: number;
  relevantRepositories?: string[];
  suggestedNext?: string[];
  confidence?: number;
}

export interface ContextResult {
  content: string;
  chunks: ContextChunk[];
  metadata: ContextMetadata;
}

export interface ProgressiveContextResult {
  level: string;
  chunks: ContextChunk[];
  hasMore: boolean;
  nextLevel?: string;
  metadata: ContextMetadata;
}

export interface StructuredContextResult {
  sections: Array<{
    title: string;
    chunks: ContextChunk[];
    relevance: number;
  }>;
  metadata: ContextMetadata;
}