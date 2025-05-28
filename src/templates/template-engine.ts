import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextChunk } from '../services/context-generator';
import { ProgressiveContext } from '../services/progressive-context';
import logger from '../utils/logger';

export interface TemplateContext {
  query: any;
  results: ContextChunk[];
  metadata?: any;
  progressive?: ProgressiveContext;
  custom?: Record<string, any>;
}

export interface Template {
  name: string;
  description: string;
  format: 'markdown' | 'json' | 'yaml' | 'html' | 'text';
  render: (context: TemplateContext) => string;
}

export class TemplateEngine {
  private templates: Map<string, Template> = new Map();
  private templateDir: string;
  private customHelpers: Map<string, (...args: any[]) => any> = new Map();

  constructor(templateDir?: string) {
    this.templateDir = templateDir || path.join(process.cwd(), 'templates');
    this.registerBuiltInTemplates();
    this.registerHelpers();
  }

  private registerBuiltInTemplates(): void {
    // Minimal template
    this.registerTemplate({
      name: 'minimal',
      description: 'Minimal context with just content',
      format: 'text',
      render: (ctx) => {
        return ctx.results
          .map(chunk => chunk.content)
          .join('\n\n---\n\n');
      }
    });

    // Detailed markdown template
    this.registerTemplate({
      name: 'detailed',
      description: 'Detailed markdown with metadata',
      format: 'markdown',
      render: (ctx) => {
        const sections = [];
        
        sections.push(`# Documentation Context\n`);
        sections.push(`**Query:** ${ctx.query.task}\n`);
        
        if (ctx.metadata) {
          sections.push('## Summary');
          sections.push(`- Total results: ${ctx.metadata.totalResults}`);
          sections.push(`- Search time: ${ctx.metadata.searchTime}ms`);
          sections.push(`- Repositories: ${ctx.metadata.repositories?.join(', ') || 'all'}`);
          sections.push('');
        }
        
        sections.push('## Results\n');
        
        ctx.results.forEach((chunk, index) => {
          sections.push(`### ${index + 1}. ${chunk.repository} - ${chunk.filepath}`);
          
          if (chunk.metadata.title) {
            sections.push(`**${chunk.metadata.title}**`);
          }
          
          sections.push(`*Score: ${chunk.score.toFixed(3)} | Type: ${chunk.type}*`);
          
          if (chunk.relevanceExplanation) {
            sections.push(`*Relevance: ${chunk.relevanceExplanation}*`);
          }
          
          sections.push('');
          
          if (chunk.type === 'code') {
            sections.push('```' + (chunk.metadata.language || ''));
            sections.push(chunk.content);
            sections.push('```');
          } else {
            sections.push(chunk.content);
          }
          
          sections.push('');
        });
        
        return sections.join('\n');
      }
    });

    // Code-focused template
    this.registerTemplate({
      name: 'code-focused',
      description: 'Emphasizes code examples',
      format: 'markdown',
      render: (ctx) => {
        const sections = [];
        const codeChunks = ctx.results.filter(c => c.type === 'code');
        const otherChunks = ctx.results.filter(c => c.type !== 'code');
        
        sections.push(`# Code Examples for: ${ctx.query.task}\n`);
        
        if (codeChunks.length > 0) {
          sections.push('## Code Snippets\n');
          
          codeChunks.forEach(chunk => {
            sections.push(`### ${chunk.filepath}`);
            sections.push('```' + (chunk.metadata.language || ''));
            sections.push(chunk.content);
            sections.push('```\n');
          });
        }
        
        if (otherChunks.length > 0) {
          sections.push('## Related Documentation\n');
          
          otherChunks.forEach(chunk => {
            sections.push(`- **${chunk.filepath}**: ${chunk.content.substring(0, 100)}...`);
          });
        }
        
        return sections.join('\n');
      }
    });

    // JSON API response template
    this.registerTemplate({
      name: 'json-api',
      description: 'Structured JSON for API responses',
      format: 'json',
      render: (ctx) => {
        return JSON.stringify({
          query: ctx.query,
          metadata: ctx.metadata,
          results: ctx.results.map(chunk => ({
            id: chunk.content.substring(0, 50),
            repository: chunk.repository,
            filepath: chunk.filepath,
            type: chunk.type,
            score: chunk.score,
            content: chunk.content,
            metadata: chunk.metadata
          }))
        }, null, 2);
      }
    });

    // Chat-friendly template
    this.registerTemplate({
      name: 'chat',
      description: 'Optimized for chat interfaces',
      format: 'text',
      render: (ctx) => {
        const sections = [];
        
        sections.push(`Here's what I found about "${ctx.query.task}":\n`);
        
        // Group by repository
        const grouped = new Map<string, ContextChunk[]>();
        ctx.results.forEach(chunk => {
          if (!grouped.has(chunk.repository)) {
            grouped.set(chunk.repository, []);
          }
          grouped.get(chunk.repository)!.push(chunk);
        });
        
        grouped.forEach((chunks, repo) => {
          sections.push(`\n📁 From ${repo}:`);
          
          chunks.slice(0, 3).forEach(chunk => {
            const preview = chunk.content
              .split('\n')
              .slice(0, 3)
              .join('\n');
            
            sections.push(`\n• ${chunk.filepath}`);
            sections.push(preview);
            
            if (chunk.content.split('\n').length > 3) {
              sections.push('  ...');
            }
          });
        });
        
        return sections.join('\n');
      }
    });

    // Learning path template
    this.registerTemplate({
      name: 'learning-path',
      description: 'Organized as a learning progression',
      format: 'markdown',
      render: (ctx) => {
        const sections = [];
        
        sections.push(`# Learning Path: ${ctx.query.task}\n`);
        
        // Categorize chunks
        const overview = ctx.results.filter(c => 
          c.type === 'heading' || 
          c.metadata.title?.toLowerCase().includes('overview') ||
          c.metadata.title?.toLowerCase().includes('introduction')
        );
        
        const concepts = ctx.results.filter(c => 
          c.type === 'paragraph' && 
          !overview.includes(c)
        );
        
        const examples = ctx.results.filter(c => 
          c.type === 'code' ||
          c.filepath.includes('example')
        );
        
        const advanced = ctx.results.filter(c => 
          c.metadata.title?.toLowerCase().includes('advanced') ||
          c.metadata.category === 'advanced'
        );
        
        if (overview.length > 0) {
          sections.push('## 1. Overview\n');
          overview.forEach(chunk => {
            sections.push(chunk.content);
            sections.push('');
          });
        }
        
        if (concepts.length > 0) {
          sections.push('## 2. Core Concepts\n');
          concepts.slice(0, 5).forEach(chunk => {
            sections.push(`### ${chunk.metadata.title || 'Concept'}`);
            sections.push(chunk.content);
            sections.push('');
          });
        }
        
        if (examples.length > 0) {
          sections.push('## 3. Practical Examples\n');
          examples.slice(0, 3).forEach(chunk => {
            sections.push(`### Example from ${chunk.filepath}`);
            if (chunk.type === 'code') {
              sections.push('```' + (chunk.metadata.language || ''));
              sections.push(chunk.content);
              sections.push('```');
            } else {
              sections.push(chunk.content);
            }
            sections.push('');
          });
        }
        
        if (advanced.length > 0) {
          sections.push('## 4. Advanced Topics\n');
          advanced.forEach(chunk => {
            sections.push(`- ${chunk.metadata.title || chunk.filepath}`);
          });
        }
        
        sections.push('\n## Next Steps\n');
        sections.push('- Practice with the examples above');
        sections.push('- Explore the full documentation');
        sections.push('- Build your own implementation');
        
        return sections.join('\n');
      }
    });
  }

  private registerHelpers(): void {
    // Truncate helper
    this.customHelpers.set('truncate', (text: string, length: number) => {
      return text.length > length ? text.substring(0, length) + '...' : text;
    });

    // Highlight helper
    this.customHelpers.set('highlight', (text: string, query: string) => {
      const regex = new RegExp(`(${query})`, 'gi');
      return text.replace(regex, '**$1**');
    });

    // Format date helper
    this.customHelpers.set('formatDate', (date: Date | string) => {
      return new Date(date).toLocaleString();
    });

    // Score formatter
    this.customHelpers.set('formatScore', (score: number) => {
      return `${(score * 100).toFixed(1)}%`;
    });
  }

  registerTemplate(template: Template): void {
    this.templates.set(template.name, template);
    logger.info(`Registered template: ${template.name}`);
  }

  registerHelper(name: string, helper: (...args: any[]) => any): void {
    this.customHelpers.set(name, helper);
  }

  async loadTemplatesFromDirectory(): Promise<void> {
    try {
      const files = await fs.readdir(this.templateDir);
      
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          const templatePath = path.join(this.templateDir, file);
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const templateModule = require(templatePath);
          const template = templateModule.default || templateModule;
          
          if (template.name && template.render) {
            this.registerTemplate(template);
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to load templates from directory', { error });
    }
  }

  render(templateName: string, context: TemplateContext): string {
    const template = this.templates.get(templateName);
    
    if (!template) {
      logger.warn(`Template not found: ${templateName}, using default`);
      return this.renderDefault(context);
    }

    try {
      // Inject helpers into context
      const enhancedContext = {
        ...context,
        helpers: Object.fromEntries(this.customHelpers)
      };
      
      return template.render(enhancedContext);
    } catch (error) {
      logger.error(`Template rendering failed: ${templateName}`, { error });
      return this.renderDefault(context);
    }
  }

  private renderDefault(context: TemplateContext): string {
    return context.results
      .map(chunk => `${chunk.repository}/${chunk.filepath}:\n${chunk.content}`)
      .join('\n\n---\n\n');
  }

  getTemplate(name: string): Template | undefined {
    return this.templates.get(name);
  }

  listTemplates(): Array<{ name: string; description: string; format: string }> {
    return Array.from(this.templates.values()).map(t => ({
      name: t.name,
      description: t.description,
      format: t.format
    }));
  }

  // Create template from string with placeholders
  createFromString(name: string, templateString: string, format: string = 'text'): void {
    this.registerTemplate({
      name,
      description: `Custom template: ${name}`,
      format: format as any,
      render: (ctx) => {
        let result = templateString;
        
        // Replace placeholders
        result = result.replace(/\{\{query\}\}/g, ctx.query.task || '');
        result = result.replace(/\{\{total\}\}/g, ctx.results.length.toString());
        result = result.replace(/\{\{time\}\}/g, ctx.metadata?.searchTime || 'N/A');
        
        // Replace result placeholders
        result = result.replace(/\{\{#results\}\}([\s\S]*?)\{\{\/results\}\}/g, (match, template) => {
          return ctx.results.map(chunk => {
            return template
              .replace(/\{\{content\}\}/g, chunk.content)
              .replace(/\{\{repository\}\}/g, chunk.repository)
              .replace(/\{\{filepath\}\}/g, chunk.filepath)
              .replace(/\{\{score\}\}/g, chunk.score.toFixed(3))
              .replace(/\{\{type\}\}/g, chunk.type);
          }).join('\n');
        });
        
        return result;
      }
    });
  }
}

// Singleton instance
let templateEngine: TemplateEngine | null = null;

export function getTemplateEngine(templateDir?: string): TemplateEngine {
  if (!templateEngine) {
    templateEngine = new TemplateEngine(templateDir);
  }
  return templateEngine;
}

export default TemplateEngine;