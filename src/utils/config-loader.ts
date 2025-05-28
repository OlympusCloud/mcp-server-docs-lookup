import * as fs from 'fs/promises';
import * as path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as yaml from 'yaml';
import { Config, PresetConfig, RepositoryConfig } from '../types/config';
import logger from './logger';

export class ConfigLoader {
  private ajv: Ajv;
  private configPath: string;
  private config: Config | null = null;

  constructor(configPath?: string) {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    this.configPath = configPath || path.join(process.cwd(), 'config', 'config.json');
  }

  async loadConfig(): Promise<Config> {
    try {
      let configData: any = {};
      
      try {
        const configContent = await fs.readFile(this.configPath, 'utf-8');
        const extension = path.extname(this.configPath).toLowerCase();
        
        if (extension === '.yaml' || extension === '.yml') {
          configData = yaml.parse(configContent);
        } else {
          configData = JSON.parse(configContent);
        }
        
        logger.info('Configuration file loaded', { path: this.configPath });
      } catch (fileError: any) {
        if (fileError.code === 'ENOENT') {
          logger.info('Configuration file not found, using defaults', { path: this.configPath });
          configData = {}; // Use empty config, defaults will be applied
        } else {
          throw fileError; // Re-throw other file errors
        }
      }

      // Skip validation for default/empty configs to avoid schema dependency
      if (Object.keys(configData).length > 0) {
        await this.validateConfig(configData);
      }
      
      this.config = this.applyDefaults(configData);
      
      logger.info('Configuration loaded successfully', {
        project: this.config.project.name,
        repositories: this.config.repositories.length
      });

      return this.config;
    } catch (error) {
      logger.error('Failed to load configuration', { error });
      throw new Error(`Configuration loading failed: ${error}`);
    }
  }

  async validateConfig(config: any): Promise<void> {
    try {
      const schemaPath = path.join(process.cwd(), 'config', 'schema.json');
      const schemaContent = await fs.readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);

      const valid = this.ajv.validate(schema, config);
      if (!valid) {
        const errors = this.ajv.errors?.map(err => `${err.instancePath} ${err.message}`).join(', ');
        throw new Error(`Configuration validation failed: ${errors}`);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.warn('Configuration schema not found, skipping validation', { error });
        return; // Skip validation if schema file doesn't exist
      }
      throw error; // Re-throw other errors
    }
  }

  private applyDefaults(config: any): Config {
    const defaults = {
      repositories: (config.repositories || []).map((repo: any) => ({
        ...repo,
        branch: repo.branch || 'main',
        authType: repo.authType || 'none',
        paths: repo.paths || ['/'],
        exclude: repo.exclude || ['node_modules', '.git', 'dist', 'build'],
        syncInterval: repo.syncInterval || 60,
        priority: repo.priority || 'medium',
        metadata: repo.metadata || {}
      })),
      contextGeneration: {
        strategies: ['hybrid'],
        maxChunks: 20,
        priorityWeighting: {
          high: 1.5,
          medium: 1.0,
          low: 0.5
        },
        customPrompts: {},
        ...config.contextGeneration
      },
      server: {
        port: 3000,
        host: 'localhost',
        cors: {
          enabled: true,
          origins: ['*']
        },
        ...config.server
      },
      vectorStore: {
        type: 'qdrant',
        qdrant: {
          url: 'http://localhost:6333',
          collectionName: 'documentation'
        },
        ...config.vectorStore
      }
    };

    return {
      project: config.project || {
        name: 'Universal Documentation Server',
        description: 'Production-ready documentation server',
        version: '1.0.0'
      },
      repositories: defaults.repositories,
      contextGeneration: defaults.contextGeneration,
      server: defaults.server,
      vectorStore: defaults.vectorStore
    };
  }

  async loadPreset(presetName: string): Promise<PresetConfig> {
    const presetPath = path.join(process.cwd(), 'config', 'presets', `${presetName}.json`);
    
    try {
      const presetContent = await fs.readFile(presetPath, 'utf-8');
      const preset = JSON.parse(presetContent);
      
      logger.info(`Loaded preset: ${presetName}`, {
        repositories: preset.repositories.length
      });

      return preset;
    } catch (error) {
      logger.error(`Failed to load preset: ${presetName}`, { error });
      throw new Error(`Preset '${presetName}' not found or invalid`);
    }
  }

  async applyPreset(presetName: string): Promise<Config> {
    if (!this.config) {
      throw new Error('Configuration must be loaded before applying presets');
    }

    const preset = await this.loadPreset(presetName);
    
    this.config.repositories = [
      ...this.config.repositories,
      ...preset.repositories.filter((r): r is RepositoryConfig => r.name !== undefined)
    ];

    logger.info(`Applied preset: ${presetName}`, {
      totalRepositories: this.config.repositories.length
    });

    return this.config;
  }

  async saveConfig(config?: Config): Promise<void> {
    const configToSave = config || this.config;
    if (!configToSave) {
      throw new Error('No configuration to save');
    }

    await this.validateConfig(configToSave);

    const extension = path.extname(this.configPath).toLowerCase();
    let content: string;
    
    if (extension === '.yaml' || extension === '.yml') {
      content = yaml.stringify(configToSave);
    } else {
      content = JSON.stringify(configToSave, null, 2);
    }

    await fs.writeFile(this.configPath, content, 'utf-8');
    logger.info('Configuration saved successfully');
  }

  getConfig(): Config {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config;
  }

  async listPresets(): Promise<string[]> {
    const presetsDir = path.join(process.cwd(), 'config', 'presets');
    
    try {
      const files = await fs.readdir(presetsDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
    } catch (error) {
      logger.error('Failed to list presets', { error });
      return [];
    }
  }

  updateRepository(name: string, updates: Partial<Config['repositories'][0]>): void {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const repoIndex = this.config.repositories.findIndex(r => r.name === name);
    if (repoIndex === -1) {
      throw new Error(`Repository '${name}' not found`);
    }

    this.config.repositories[repoIndex] = {
      ...this.config.repositories[repoIndex],
      ...updates
    };

    logger.info(`Updated repository: ${name}`, { updates });
  }

  addRepository(repository: Config['repositories'][0]): void {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const exists = this.config.repositories.some(r => r.name === repository.name);
    if (exists) {
      throw new Error(`Repository '${repository.name}' already exists`);
    }

    this.config.repositories.push(repository);
    logger.info(`Added repository: ${repository.name}`);
  }

  removeRepository(name: string): void {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const repoIndex = this.config.repositories.findIndex(r => r.name === name);
    if (repoIndex === -1) {
      throw new Error(`Repository '${name}' not found`);
    }

    this.config.repositories.splice(repoIndex, 1);
    logger.info(`Removed repository: ${name}`);
  }
}

export default ConfigLoader;