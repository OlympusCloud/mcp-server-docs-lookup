import { ContextGenerator, ContextQuery } from './context-generator';
import { VectorStore } from './vector-store';
import { EmbeddingService } from './embedding';
import { ContextChunk } from '../types/context';
import logger from '../utils/logger';

export interface HubImplementationQuery {
  hubType: string;
  functionality: string;
  includeArchitecture?: boolean;
  includeApiSpecs?: boolean;
  includeExamples?: boolean;
  includeDeployment?: boolean;
  includeTesting?: boolean;
}

export interface CrossHubQuery {
  sourceHub: string;
  targetHub: string;
  integrationType: 'api' | 'event' | 'data' | 'all';
  includeSecurityPatterns?: boolean;
  includeMonitoring?: boolean;
}

export interface OlympusCloudContext {
  architecture: ContextChunk[];
  apiSpecs: ContextChunk[];
  examples: ContextChunk[];
  deployment: ContextChunk[];
  testing: ContextChunk[];
  security: ContextChunk[];
  monitoring: ContextChunk[];
}

export class OlympusCloudContextGenerator {
  private contextGenerator: ContextGenerator;
  private vectorStore: VectorStore;
  private embeddingService: EmbeddingService;

  constructor(
    vectorStore: VectorStore,
    embeddingService: EmbeddingService,
    contextGenerator: ContextGenerator
  ) {
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.contextGenerator = contextGenerator;
  }

  async generateHubImplementationContext(
    query: HubImplementationQuery
  ): Promise<OlympusCloudContext> {
    const context: OlympusCloudContext = {
      architecture: [],
      apiSpecs: [],
      examples: [],
      deployment: [],
      testing: [],
      security: [],
      monitoring: []
    };

    // Build comprehensive query for hub implementation
    const baseQuery = `implement ${query.functionality} for ${query.hubType} hub Olympus Cloud`;

    // Architecture patterns
    if (query.includeArchitecture !== false) {
      const archQuery: ContextQuery = {
        task: `${baseQuery} architecture patterns design`,
        categories: ['architecture', 'patterns'],
        repositories: ['olympus-architecture', 'hub-templates'],
        maxResults: 10
      };
      const archResult = await this.contextGenerator.generateContext(archQuery);
      context.architecture = archResult.results;
    }

    // API specifications
    if (query.includeApiSpecs !== false) {
      const apiQuery: ContextQuery = {
        task: `${query.hubType} hub API endpoints ${query.functionality}`,
        categories: ['api', 'specifications'],
        repositories: ['api-standards', 'hub-templates'],
        maxResults: 10
      };
      const apiResult = await this.contextGenerator.generateContext(apiQuery);
      context.apiSpecs = apiResult.results;
    }

    // Implementation examples
    if (query.includeExamples !== false) {
      const exampleQuery: ContextQuery = {
        task: `${query.hubType} hub implementation example ${query.functionality}`,
        categories: ['implementation', 'examples'],
        repositories: ['hub-templates'],
        maxResults: 15
      };
      const exampleResult = await this.contextGenerator.generateContext(exampleQuery);
      context.examples = exampleResult.results;
    }

    // Deployment patterns
    if (query.includeDeployment !== false) {
      const deployQuery: ContextQuery = {
        task: `deploy ${query.hubType} hub Kubernetes Azure infrastructure`,
        categories: ['deployment', 'infrastructure'],
        repositories: ['deployment-patterns'],
        maxResults: 8
      };
      const deployResult = await this.contextGenerator.generateContext(deployQuery);
      context.deployment = deployResult.results;
    }

    // Testing guidelines
    if (query.includeTesting !== false) {
      const testQuery: ContextQuery = {
        task: `testing ${query.hubType} hub ${query.functionality} unit integration`,
        categories: ['testing', 'quality'],
        repositories: ['hub-templates', 'api-standards'],
        maxResults: 8
      };
      const testResult = await this.contextGenerator.generateContext(testQuery);
      context.testing = testResult.results;
    }

    // Security considerations
    const securityQuery: ContextQuery = {
      task: `${query.hubType} hub security authentication authorization OWASP`,
      categories: ['security'],
      repositories: ['security-guidelines'],
      maxResults: 10
    };
    const securityResult = await this.contextGenerator.generateContext(securityQuery);
    context.security = securityResult.results;

    // Monitoring and observability
    const monitoringQuery: ContextQuery = {
      task: `${query.hubType} hub monitoring observability metrics logging`,
      categories: ['monitoring', 'observability'],
      repositories: ['deployment-patterns'],
      maxResults: 5
    };
    const monitoringResult = await this.contextGenerator.generateContext(monitoringQuery);
    context.monitoring = monitoringResult.results;

    logger.info('Generated Olympus Cloud hub implementation context', {
      hubType: query.hubType,
      functionality: query.functionality,
      totalChunks: this.countTotalChunks(context)
    });

    return context;
  }

  async generateCrossHubContext(
    query: CrossHubQuery
  ): Promise<OlympusCloudContext> {
    const context: OlympusCloudContext = {
      architecture: [],
      apiSpecs: [],
      examples: [],
      deployment: [],
      testing: [],
      security: [],
      monitoring: []
    };

    // Integration patterns between hubs
    const integrationQuery: ContextQuery = {
      task: `integrate ${query.sourceHub} hub with ${query.targetHub} hub ${query.integrationType} integration patterns`,
      categories: ['architecture', 'integration'],
      repositories: ['olympus-architecture', 'hub-templates'],
      maxResults: 15
    };
    const integrationResult = await this.contextGenerator.generateContext(integrationQuery);
    context.architecture = integrationResult.results;

    // API integration specs
    if (query.integrationType === 'api' || query.integrationType === 'all') {
      const apiIntegrationQuery: ContextQuery = {
        task: `${query.sourceHub} ${query.targetHub} API integration endpoints contracts`,
        categories: ['api', 'integration'],
        repositories: ['api-standards'],
        maxResults: 10
      };
      const apiResult = await this.contextGenerator.generateContext(apiIntegrationQuery);
      context.apiSpecs = apiResult.results;
    }

    // Event-driven integration
    if (query.integrationType === 'event' || query.integrationType === 'all') {
      const eventQuery: ContextQuery = {
        task: `${query.sourceHub} ${query.targetHub} event-driven integration messaging patterns`,
        categories: ['integration', 'messaging'],
        repositories: ['olympus-architecture', 'hub-templates'],
        maxResults: 10
      };
      const eventResult = await this.contextGenerator.generateContext(eventQuery);
      context.examples = [...context.examples, ...eventResult.results];
    }

    // Data integration patterns
    if (query.integrationType === 'data' || query.integrationType === 'all') {
      const dataQuery: ContextQuery = {
        task: `${query.sourceHub} ${query.targetHub} data integration synchronization patterns`,
        categories: ['integration', 'data'],
        repositories: ['olympus-architecture'],
        maxResults: 10
      };
      const dataResult = await this.contextGenerator.generateContext(dataQuery);
      context.examples = [...context.examples, ...dataResult.results];
    }

    // Security patterns for cross-hub communication
    if (query.includeSecurityPatterns !== false) {
      const securityQuery: ContextQuery = {
        task: `cross-hub security ${query.sourceHub} ${query.targetHub} authentication authorization zero-trust`,
        categories: ['security', 'integration'],
        repositories: ['security-guidelines'],
        maxResults: 10
      };
      const securityResult = await this.contextGenerator.generateContext(securityQuery);
      context.security = securityResult.results;
    }

    // Monitoring cross-hub interactions
    if (query.includeMonitoring !== false) {
      const monitoringQuery: ContextQuery = {
        task: `monitor cross-hub communication ${query.sourceHub} ${query.targetHub} distributed tracing`,
        categories: ['monitoring', 'observability'],
        repositories: ['deployment-patterns'],
        maxResults: 8
      };
      const monitoringResult = await this.contextGenerator.generateContext(monitoringQuery);
      context.monitoring = monitoringResult.results;
    }

    logger.info('Generated Olympus Cloud cross-hub context', {
      sourceHub: query.sourceHub,
      targetHub: query.targetHub,
      integrationType: query.integrationType,
      totalChunks: this.countTotalChunks(context)
    });

    return context;
  }

  async discoverHubDependencies(hubName: string): Promise<Map<string, string[]>> {
    const dependencies = new Map<string, string[]>();

    // Search for hub references in architecture docs
    const searchQuery: ContextQuery = {
      task: `${hubName} hub dependencies integrations references`,
      categories: ['architecture', 'integration'],
      maxResults: 50
    };

    const result = await this.contextGenerator.generateContext(searchQuery);

    // Extract hub references from content
    const hubPattern = /(\w+)[-\s]hub/gi;
    const apiPattern = /(\w+)[-\s]api/gi;

    result.results.forEach(chunk => {
      const content = chunk.content.toLowerCase();
      const foundHubs = new Set<string>();
      const foundApis = new Set<string>();

      let match;
      while ((match = hubPattern.exec(content)) !== null) {
        if (match[1] !== hubName.toLowerCase()) {
          foundHubs.add(match[1]);
        }
      }

      while ((match = apiPattern.exec(content)) !== null) {
        foundApis.add(match[1]);
      }

      if (foundHubs.size > 0) {
        dependencies.set(chunk.filepath, Array.from(foundHubs));
      }
    });

    return dependencies;
  }

  async validateApiContract(
    hubName: string,
    apiEndpoint: string
  ): Promise<ContextChunk[]> {
    const query: ContextQuery = {
      task: `${hubName} hub API contract specification ${apiEndpoint} OpenAPI schema validation`,
      categories: ['api', 'specifications'],
      repositories: ['api-standards'],
      maxResults: 10
    };

    const result = await this.contextGenerator.generateContext(query);
    
    // Filter for actual API specifications
    return result.results.filter(chunk => 
      chunk.content.includes('openapi') ||
      chunk.content.includes('swagger') ||
      chunk.content.includes('paths:') ||
      chunk.content.includes('endpoints')
    );
  }

  async getDeploymentPattern(
    hubName: string,
    environment: 'development' | 'staging' | 'production'
  ): Promise<ContextChunk[]> {
    const query: ContextQuery = {
      task: `${hubName} hub deployment ${environment} Kubernetes Helm Azure configuration`,
      categories: ['deployment', 'infrastructure'],
      repositories: ['deployment-patterns'],
      maxResults: 15
    };

    const result = await this.contextGenerator.generateContext(query);
    
    // Prioritize environment-specific patterns
    return result.results.sort((a, b) => {
      const aHasEnv = a.content.toLowerCase().includes(environment);
      const bHasEnv = b.content.toLowerCase().includes(environment);
      
      if (aHasEnv && !bHasEnv) return -1;
      if (!aHasEnv && bHasEnv) return 1;
      return b.score - a.score;
    });
  }

  formatOlympusCloudContext(context: OlympusCloudContext): string {
    const sections: string[] = [];

    sections.push('# Olympus Cloud Implementation Context\n');

    if (context.architecture.length > 0) {
      sections.push('## Architecture Patterns\n');
      context.architecture.forEach(chunk => {
        sections.push(`### ${chunk.filepath}`);
        sections.push(chunk.content);
        sections.push('');
      });
    }

    if (context.apiSpecs.length > 0) {
      sections.push('\n## API Specifications\n');
      context.apiSpecs.forEach(chunk => {
        sections.push(`### ${chunk.filepath}`);
        sections.push('```yaml');
        sections.push(chunk.content);
        sections.push('```\n');
      });
    }

    if (context.examples.length > 0) {
      sections.push('\n## Implementation Examples\n');
      context.examples.forEach(chunk => {
        sections.push(`### ${chunk.filepath}`);
        if (chunk.type === 'code') {
          sections.push(`\`\`\`${chunk.metadata.language || ''}`);
          sections.push(chunk.content);
          sections.push('```');
        } else {
          sections.push(chunk.content);
        }
        sections.push('');
      });
    }

    if (context.deployment.length > 0) {
      sections.push('\n## Deployment Configuration\n');
      context.deployment.forEach(chunk => {
        sections.push(`### ${chunk.filepath}`);
        sections.push(chunk.content);
        sections.push('');
      });
    }

    if (context.security.length > 0) {
      sections.push('\n## Security Considerations\n');
      context.security.forEach(chunk => {
        sections.push(`- ${chunk.content.split('\n')[0]}`);
      });
      sections.push('');
    }

    if (context.monitoring.length > 0) {
      sections.push('\n## Monitoring & Observability\n');
      context.monitoring.forEach(chunk => {
        sections.push(`### ${chunk.filepath}`);
        sections.push(chunk.content);
        sections.push('');
      });
    }

    return sections.join('\n');
  }

  private countTotalChunks(context: OlympusCloudContext): number {
    return Object.values(context).reduce((total, chunks) => total + chunks.length, 0);
  }
}

export default OlympusCloudContextGenerator;