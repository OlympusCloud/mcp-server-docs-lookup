export interface DocumentMetadata {
  title?: string;
  description?: string;
  tags?: string[];
  category?: string;
  language?: string;
  framework?: string;
  version?: string;
  author?: string;
  date?: Date;
  [key: string]: any;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  repository: string;
  filepath: string;
  content: string;
  type: 'heading' | 'paragraph' | 'code' | 'list' | 'table' | 'blockquote' | 'other';
  metadata: DocumentMetadata;
  startLine?: number;
  endLine?: number;
  parentChunkId?: string;
  childChunkIds?: string[];
  embedding?: number[];
  hash: string;
  score?: number;
  relevanceExplanation?: string;
}

export interface Document {
  id: string;
  repository: string;
  filepath: string;
  content: string;
  type: DocumentType;
  metadata: DocumentMetadata;
  chunks: DocumentChunk[];
  lastModified: Date;
  hash: string;
}

export enum DocumentType {
  MARKDOWN = 'markdown',
  RESTRUCTURED_TEXT = 'rst',
  HTML = 'html',
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
  PYTHON = 'python',
  JAVA = 'java',
  CSHARP = 'csharp',
  GO = 'go',
  RUST = 'rust',
  YAML = 'yaml',
  JSON = 'json',
  XML = 'xml',
  PLAIN_TEXT = 'text',
  UNKNOWN = 'unknown'
}

export interface ChunkingStrategy {
  maxChunkSize: number;
  overlapSize: number;
  respectBoundaries: boolean;
  preserveContext: boolean;
}

export interface ProcessingResult {
  document: Document;
  chunks: DocumentChunk[];
  errors?: string[];
}