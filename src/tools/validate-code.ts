import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CodeValidator } from '../services/code-validator';
import { VectorStore } from '../services/vector-store';
import { EmbeddingService } from '../services/embedding';
import logger from '../utils/logger';

export interface ValidateCodeParams {
  code: string;
  language: string;
  task?: string;
  framework?: string;
  strictMode?: boolean;
}

export class ValidateCodeTool implements Tool {
  [key: string]: unknown;
  name = 'validate_code';
  description = 'Validate code against documentation, best practices, and coding standards';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      code: {
        type: 'string',
        description: 'The code to validate',
      },
      language: {
        type: 'string',
        description: 'Programming language (javascript, typescript, python, etc.)',
        enum: ['javascript', 'typescript', 'python', 'go', 'java', 'csharp'],
      },
      task: {
        type: 'string',
        description: 'What the code is supposed to do (helps find relevant docs)',
      },
      framework: {
        type: 'string',
        description: 'Framework being used (react, angular, vue, etc.)',
      },
      strictMode: {
        type: 'boolean',
        description: 'Enable strict validation (fail on warnings)',
        default: false,
      },
    },
    required: ['code', 'language'],
  };

  constructor(
    private vectorStore: VectorStore,
    private embeddingService: EmbeddingService,
    private validator: CodeValidator
  ) {}

  async execute(params: ValidateCodeParams) {
    try {
      const { code, language, task, framework, strictMode } = params;

      // Find relevant documentation
      let relevantDocs: any[] = [];
      if (task) {
        const query = `${task} ${framework || ''} ${language} best practices examples`;
        const embedding = await this.embeddingService.generateEmbedding(query);
        const searchResults = await this.vectorStore.search(embedding, {
          limit: 10,
          scoreThreshold: 0.7,
        });
        relevantDocs = searchResults.map(r => r.chunk);
      }

      // Validate the code
      const validationResult = await this.validator.validateCode(
        code,
        language,
        relevantDocs
      );

      // Format response
      const response: any = {
        valid: validationResult.valid && (!strictMode || validationResult.warnings.length === 0),
        score: validationResult.score,
        summary: this.generateSummary(validationResult),
      };

      if (validationResult.errors.length > 0) {
        response.errors = validationResult.errors.map(e => ({
          line: e.line,
          column: e.column,
          message: e.message,
          severity: e.severity,
          fix: e.fix ? {
            description: e.fix.description,
            code: e.fix.text,
          } : undefined,
        }));
      }

      if (validationResult.warnings.length > 0) {
        response.warnings = validationResult.warnings.map(w => ({
          line: w.line,
          column: w.column,
          message: w.message,
          fix: w.fix ? {
            description: w.fix.description,
            code: w.fix.text,
          } : undefined,
        }));
      }

      if (validationResult.suggestions.length > 0) {
        response.suggestions = validationResult.suggestions.map(s => ({
          type: s.type,
          message: s.message,
          example: s.example,
          documentation: s.documentation,
        }));
      }

      // Add documentation-based recommendations
      if (relevantDocs.length > 0) {
        response.recommendations = this.generateRecommendations(code, relevantDocs);
      }

      return response;
    } catch (error) {
      logger.error('Code validation failed', { error });
      throw error;
    }
  }

  private generateSummary(result: any): string {
    const parts = [];
    
    if (result.valid) {
      parts.push(`✅ Code is valid (score: ${result.score}/100)`);
    } else {
      parts.push(`❌ Code has ${result.errors.length} error(s)`);
    }

    if (result.warnings.length > 0) {
      parts.push(`⚠️  ${result.warnings.length} warning(s)`);
    }

    if (result.suggestions.length > 0) {
      parts.push(`💡 ${result.suggestions.length} suggestion(s)`);
    }

    return parts.join(' | ');
  }

  private generateRecommendations(code: string, docs: any[]): any[] {
    const recommendations = [];

    // Check if code follows documented patterns
    for (const doc of docs) {
      if (doc.type === 'code' && doc.metadata.pattern) {
        if (!code.includes(doc.metadata.pattern)) {
          recommendations.push({
            type: 'pattern',
            message: `Consider using the ${doc.metadata.title} pattern`,
            example: doc.content,
            source: `${doc.repository}:${doc.filepath}`,
          });
        }
      }
    }

    return recommendations.slice(0, 3); // Limit to top 3 recommendations
  }
}