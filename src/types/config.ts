export interface ProjectConfig {
  name: string;
  description?: string;
  version?: string;
}

export interface RepositoryCredentials {
  token?: string;
  username?: string;
  password?: string;
  sshKey?: string;
}

export interface RepositoryConfig {
  name: string;
  url: string;
  branch?: string;
  authType?: 'none' | 'token' | 'ssh';
  credentials?: RepositoryCredentials;
  paths?: string[];
  exclude?: string[];
  syncInterval?: number;
  priority?: 'high' | 'medium' | 'low';
  category?: string;
  metadata?: Record<string, any>;
}

export interface PriorityWeighting {
  high?: number;
  medium?: number;
  low?: number;
}

export interface ContextGenerationConfig {
  strategies?: ('semantic' | 'keyword' | 'hybrid')[];
  maxChunks?: number;
  priorityWeighting?: PriorityWeighting;
  customPrompts?: Record<string, string>;
}

export interface ServerCorsConfig {
  enabled?: boolean;
  origins?: string[];
}

export interface ServerConfig {
  port?: number;
  host?: string;
  cors?: ServerCorsConfig;
}

export interface QdrantConfig {
  url?: string;
  collectionName?: string;
}

export interface VectorStoreConfig {
  type?: 'qdrant' | 'memory';
  qdrant?: QdrantConfig;
}

export interface Config {
  project: ProjectConfig;
  repositories: RepositoryConfig[];
  contextGeneration?: ContextGenerationConfig;
  server?: ServerConfig;
  vectorStore?: VectorStoreConfig;
}

export interface PresetConfig {
  repositories: Partial<RepositoryConfig>[];
}