import * as path from 'path';
import * as fs from 'fs/promises';
import { DocumentProcessor } from '../services/document-processor';
import { ContextGenerator } from '../services/context-generator';
import { Document, DocumentChunk } from '../types/document';
import logger from '../utils/logger';

export interface Plugin {
  name: string;
  version: string;
  description?: string;
  processors?: DocumentProcessorPlugin[];
  contextGenerators?: ContextGeneratorPlugin[];
  embeddings?: EmbeddingPlugin[];
  init?: (config: any) => Promise<void>;
  destroy?: () => Promise<void>;
}

export interface DocumentProcessorPlugin {
  fileTypes: string[];
  process: (document: Document) => Promise<DocumentChunk[]>;
}

export interface ContextGeneratorPlugin {
  name: string;
  strategies: string[];
  generate: (query: any, chunks: DocumentChunk[]) => Promise<DocumentChunk[]>;
}

export interface EmbeddingPlugin {
  name: string;
  modelName: string;
  generateEmbedding: (text: string) => Promise<number[]>;
  generateBatchEmbeddings: (texts: string[]) => Promise<number[][]>;
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private pluginDir: string;
  private documentProcessors: Map<string, DocumentProcessorPlugin[]> = new Map();
  private contextGenerators: Map<string, ContextGeneratorPlugin> = new Map();
  private embeddingProviders: Map<string, EmbeddingPlugin> = new Map();

  constructor(pluginDir?: string) {
    this.pluginDir = pluginDir || path.join(process.cwd(), 'plugins');
  }

  async loadPlugins(): Promise<void> {
    try {
      await this.ensurePluginDirectory();
      const files = await fs.readdir(this.pluginDir);
      
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          await this.loadPlugin(path.join(this.pluginDir, file));
        }
      }

      logger.info(`Loaded ${this.plugins.size} plugins`);
    } catch (error) {
      logger.error('Failed to load plugins', { error });
    }
  }

  private async ensurePluginDirectory(): Promise<void> {
    try {
      await fs.access(this.pluginDir);
    } catch {
      await fs.mkdir(this.pluginDir, { recursive: true });
      logger.info(`Created plugin directory: ${this.pluginDir}`);
    }
  }

  private async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pluginModule = require(pluginPath);
      const plugin: Plugin = pluginModule.default || pluginModule;

      if (!plugin.name || !plugin.version) {
        logger.warn(`Invalid plugin at ${pluginPath}: missing name or version`);
        return;
      }

      // Initialize plugin if needed
      if (plugin.init) {
        await plugin.init({});
      }

      // Register document processors
      if (plugin.processors) {
        for (const processor of plugin.processors) {
          for (const fileType of processor.fileTypes) {
            if (!this.documentProcessors.has(fileType)) {
              this.documentProcessors.set(fileType, []);
            }
            this.documentProcessors.get(fileType)!.push(processor);
          }
        }
      }

      // Register context generators
      if (plugin.contextGenerators) {
        for (const generator of plugin.contextGenerators) {
          this.contextGenerators.set(generator.name, generator);
        }
      }

      // Register embedding providers
      if (plugin.embeddings) {
        for (const embedding of plugin.embeddings) {
          this.embeddingProviders.set(embedding.name, embedding);
        }
      }

      this.plugins.set(plugin.name, plugin);
      logger.info(`Loaded plugin: ${plugin.name} v${plugin.version}`);
    } catch (error) {
      logger.error(`Failed to load plugin from ${pluginPath}`, { error });
    }
  }

  async registerPlugin(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} already registered`);
    }

    if (plugin.init) {
      await plugin.init({});
    }

    this.plugins.set(plugin.name, plugin);
    logger.info(`Registered plugin: ${plugin.name} v${plugin.version}`);
  }

  async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (plugin.destroy) {
      await plugin.destroy();
    }

    // Remove processors
    if (plugin.processors) {
      for (const processor of plugin.processors) {
        for (const fileType of processor.fileTypes) {
          const processors = this.documentProcessors.get(fileType);
          if (processors) {
            const index = processors.indexOf(processor);
            if (index > -1) {
              processors.splice(index, 1);
            }
          }
        }
      }
    }

    // Remove context generators
    if (plugin.contextGenerators) {
      for (const generator of plugin.contextGenerators) {
        this.contextGenerators.delete(generator.name);
      }
    }

    // Remove embedding providers
    if (plugin.embeddings) {
      for (const embedding of plugin.embeddings) {
        this.embeddingProviders.delete(embedding.name);
      }
    }

    this.plugins.delete(name);
    logger.info(`Unregistered plugin: ${name}`);
  }

  getDocumentProcessors(fileType: string): DocumentProcessorPlugin[] {
    return this.documentProcessors.get(fileType) || [];
  }

  getContextGenerator(name: string): ContextGeneratorPlugin | undefined {
    return this.contextGenerators.get(name);
  }

  getEmbeddingProvider(name: string): EmbeddingPlugin | undefined {
    return this.embeddingProviders.get(name);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  // Create a plugin-aware document processor
  createEnhancedDocumentProcessor(baseProcessor: DocumentProcessor): DocumentProcessor {
    // Create a proxy to intercept processDocument calls
    return new Proxy(baseProcessor, {
      get: (target, prop) => {
        if (prop === 'processDocument') {
          return async (filepath: string, content: string, repository: any) => {
            // First try plugin processors
            const ext = path.extname(filepath).toLowerCase();
            const pluginProcessors = this.getDocumentProcessors(ext);
            
            if (pluginProcessors.length > 0) {
              const document: Document = {
                id: `plugin_${Date.now()}`,
                repository: repository.name,
                filepath,
                content,
                type: 'unknown' as any,
                metadata: {},
                chunks: [],
                lastModified: new Date(),
                hash: ''
              };

              try {
                const chunks = await pluginProcessors[0].process(document);
                return { document, chunks };
              } catch (error) {
                logger.warn('Plugin processor failed, falling back to default', { 
                  filepath, 
                  error 
                });
              }
            }

            // Fall back to default processor
            return target.processDocument(filepath, content, repository);
          };
        }
        
        return target[prop as keyof DocumentProcessor];
      }
    });
  }

  // Create a plugin-aware context generator
  createEnhancedContextGenerator(baseGenerator: ContextGenerator): ContextGenerator {
    return new Proxy(baseGenerator, {
      get: (target, prop) => {
        if (prop === 'generateContext') {
          return async (query: any) => {
            // First generate base context
            const baseResult = await target.generateContext(query);
            
            // Apply plugin context generators
            for (const [name, generator] of this.contextGenerators) {
              if (generator.strategies.includes(query.strategy || 'default')) {
                try {
                  const enhancedChunks = await generator.generate(
                    query, 
                    baseResult.results as any
                  );
                  baseResult.results = enhancedChunks as any;
                } catch (error) {
                  logger.warn(`Plugin context generator ${name} failed`, { error });
                }
              }
            }
            
            return baseResult;
          };
        }
        
        return target[prop as keyof ContextGenerator];
      }
    });
  }
}

// Singleton instance
let pluginManager: PluginManager | null = null;

export function getPluginManager(pluginDir?: string): PluginManager {
  if (!pluginManager) {
    pluginManager = new PluginManager(pluginDir);
  }
  return pluginManager;
}

export default PluginManager;