import { Router, Request, Response } from 'express';
import { VectorStore } from '../services/vector-store';
import { EmbeddingService } from '../services/embedding';
import { ContextGenerator } from '../services/context-generator';
import { OlympusCloudContextGenerator } from '../services/olympus-cloud-handler';
import logger from '../utils/logger';

export default function createOlympusRoutes(
  vectorStore: VectorStore,
  embeddingService: EmbeddingService,
  contextGenerator: ContextGenerator
): Router {
  const router = Router();
  const olympusGenerator = new OlympusCloudContextGenerator(
    vectorStore,
    embeddingService,
    contextGenerator
  );

  // Generate hub implementation context
  router.post('/hub-implementation', async (req: Request, res: Response) => {
    try {
      const {
        hubType,
        functionality,
        includeArchitecture,
        includeApiSpecs,
        includeExamples,
        includeDeployment,
        includeTesting
      } = req.body;

      if (!hubType || !functionality) {
        return res.status(400).json({
          error: 'hubType and functionality are required'
        });
      }

      const context = await olympusGenerator.generateHubImplementationContext({
        hubType,
        functionality,
        includeArchitecture,
        includeApiSpecs,
        includeExamples,
        includeDeployment,
        includeTesting
      });

      return res.json({
        hubType,
        functionality,
        context,
        summary: {
          architecture: context.architecture.length,
          apiSpecs: context.apiSpecs.length,
          examples: context.examples.length,
          deployment: context.deployment.length,
          testing: context.testing.length,
          security: context.security.length,
          monitoring: context.monitoring.length
        }
      });
    } catch (error) {
      logger.error('Hub implementation context generation failed', { error });
      return res.status(500).json({
        error: 'Failed to generate hub implementation context',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generate cross-hub integration context
  router.post('/cross-hub', async (req: Request, res: Response) => {
    try {
      const {
        sourceHub,
        targetHub,
        integrationType,
        includeSecurityPatterns,
        includeMonitoring
      } = req.body;

      if (!sourceHub || !targetHub || !integrationType) {
        return res.status(400).json({
          error: 'sourceHub, targetHub, and integrationType are required'
        });
      }

      if (!['api', 'event', 'data', 'all'].includes(integrationType)) {
        return res.status(400).json({
          error: 'integrationType must be: api, event, data, or all'
        });
      }

      const context = await olympusGenerator.generateCrossHubContext({
        sourceHub,
        targetHub,
        integrationType,
        includeSecurityPatterns,
        includeMonitoring
      });

      return res.json({
        sourceHub,
        targetHub,
        integrationType,
        context,
        summary: {
          totalPatterns: context.architecture.length + context.examples.length,
          securityPatterns: context.security.length,
          monitoringPatterns: context.monitoring.length
        }
      });
    } catch (error) {
      logger.error('Cross-hub context generation failed', { error });
      return res.status(500).json({
        error: 'Failed to generate cross-hub context',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Discover hub dependencies
  router.get('/hub-dependencies/:hubName', async (req: Request, res: Response) => {
    try {
      const { hubName } = req.params;
      
      const dependencies = await olympusGenerator.discoverHubDependencies(hubName);
      
      const dependencyList: Array<{ file: string; dependencies: string[] }> = [];
      dependencies.forEach((deps, file) => {
        dependencyList.push({ file, dependencies: deps });
      });

      return res.json({
        hub: hubName,
        dependencies: dependencyList,
        uniqueHubs: Array.from(new Set(
          dependencyList.flatMap(d => d.dependencies)
        ))
      });
    } catch (error) {
      logger.error('Hub dependency discovery failed', { error });
      return res.status(500).json({
        error: 'Failed to discover hub dependencies',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Validate API contract
  router.post('/validate-api', async (req: Request, res: Response) => {
    try {
      const { hubName, apiEndpoint } = req.body;

      if (!hubName || !apiEndpoint) {
        return res.status(400).json({
          error: 'hubName and apiEndpoint are required'
        });
      }

      const contracts = await olympusGenerator.validateApiContract(hubName, apiEndpoint);

      return res.json({
        hubName,
        apiEndpoint,
        contracts: contracts.map(chunk => ({
          filepath: chunk.filepath,
          content: chunk.content,
          score: chunk.score
        })),
        found: contracts.length > 0
      });
    } catch (error) {
      logger.error('API contract validation failed', { error });
      return res.status(500).json({
        error: 'Failed to validate API contract',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get deployment patterns
  router.get('/deployment-pattern/:hubName/:environment', async (req: Request, res: Response) => {
    try {
      const { hubName, environment } = req.params;
      
      if (!['development', 'staging', 'production'].includes(environment)) {
        return res.status(400).json({
          error: 'Environment must be: development, staging, or production'
        });
      }

      const patterns = await olympusGenerator.getDeploymentPattern(
        hubName,
        environment as 'development' | 'staging' | 'production'
      );

      return res.json({
        hubName,
        environment,
        patterns: patterns.map(chunk => ({
          filepath: chunk.filepath,
          content: chunk.content,
          score: chunk.score,
          metadata: chunk.metadata
        }))
      });
    } catch (error) {
      logger.error('Deployment pattern retrieval failed', { error });
      return res.status(500).json({
        error: 'Failed to get deployment patterns',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generate formatted Olympus Cloud context
  router.post('/format-context', async (req: Request, res: Response) => {
    try {
      const { query } = req.body;

      if (!query || !query.hubType) {
        return res.status(400).json({
          error: 'Query with hubType is required'
        });
      }

      const context = await olympusGenerator.generateHubImplementationContext(query);
      const formatted = olympusGenerator.formatOlympusCloudContext(context);

      return res.type('text/markdown').send(formatted);
    } catch (error) {
      logger.error('Context formatting failed', { error });
      return res.status(500).json({
        error: 'Failed to format context',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

