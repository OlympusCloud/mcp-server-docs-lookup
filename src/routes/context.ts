import { Router, Request, Response } from 'express';
import { ContextGenerator, ContextQuery } from '../services/context-generator';
import { getTemplateEngine } from '../templates/template-engine';
import logger from '../utils/logger';

export default function createContextRoutes(contextGenerator: ContextGenerator): Router {
  const router = Router();
  const templateEngine = getTemplateEngine();

  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const query: ContextQuery = {
        task: req.body.task,
        language: req.body.language,
        framework: req.body.framework,
        context: req.body.context,
        maxResults: req.body.maxResults,
        repositories: req.body.repositories,
        categories: req.body.categories
      };

      if (!query.task) {
        return res.status(400).json({
          error: 'Task is required'
        });
      }

      const result = await contextGenerator.generateContext(query);
      
      return res.json({
        query: result.query,
        strategy: result.strategy,
        results: result.results,
        metadata: result.metadata
      });
    } catch (error) {
      logger.error('Context generation failed', { error });
      return res.status(500).json({
        error: 'Failed to generate context',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.post('/generate-formatted', async (req: Request, res: Response) => {
    try {
      const query: ContextQuery = {
        task: req.body.task,
        language: req.body.language,
        framework: req.body.framework,
        context: req.body.context,
        maxResults: req.body.maxResults,
        repositories: req.body.repositories,
        categories: req.body.categories
      };

      if (!query.task) {
        return res.status(400).json({
          error: 'Task is required'
        });
      }

      const formattedContext = await contextGenerator.generateFormattedContext(query);
      
      return res.type('text/plain').send(formattedContext);
    } catch (error) {
      logger.error('Formatted context generation failed', { error });
      return res.status(500).json({
        error: 'Failed to generate formatted context',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.post('/generate-templated', async (req: Request, res: Response) => {
    try {
      const {
        task,
        language,
        framework,
        context,
        maxResults,
        repositories,
        categories,
        template = 'detailed'
      } = req.body;

      const query: ContextQuery = {
        task,
        language,
        framework,
        context,
        maxResults,
        repositories,
        categories
      };

      if (!query.task) {
        return res.status(400).json({
          error: 'Task is required'
        });
      }

      const result = await contextGenerator.generateContext(query);
      
      const rendered = templateEngine.render(template, {
        query,
        results: result.results,
        metadata: result.metadata
      });
      
      // Set content type based on template format
      const templateObj = templateEngine.getTemplate(template);
      const contentType = templateObj?.format === 'json' ? 'application/json' :
                         templateObj?.format === 'html' ? 'text/html' :
                         templateObj?.format === 'markdown' ? 'text/markdown' :
                         'text/plain';
      
      return res.type(contentType).send(rendered);
    } catch (error) {
      logger.error('Templated context generation failed', { error });
      return res.status(500).json({
        error: 'Failed to generate templated context',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/templates', (req: Request, res: Response) => {
    const templates = templateEngine.listTemplates();
    return res.json({ templates });
  });

  router.post('/templates', async (req: Request, res: Response) => {
    try {
      const { name, template, format } = req.body;

      if (!name || !template) {
        return res.status(400).json({
          error: 'Name and template are required'
        });
      }

      templateEngine.createFromString(name, template, format);
      
      return res.json({
        message: 'Template created successfully',
        name
      });
    } catch (error) {
      logger.error('Template creation failed', { error });
      return res.status(500).json({
        error: 'Failed to create template',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

