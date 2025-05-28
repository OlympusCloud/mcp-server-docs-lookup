import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { VectorStore } from '../services/vector-store';
import { EmbeddingService } from '../services/embedding';
import { TemplateEngine } from '../templates/template-engine';
import logger from '../utils/logger';

export interface GenerateCodeParams {
  task: string;
  language: string;
  framework?: string;
  style?: 'minimal' | 'complete' | 'production';
  includeTests?: boolean;
  includeComments?: boolean;
}

export class GenerateCodeTool implements Tool {
  [key: string]: unknown;
  name = 'generate_code';
  description = 'Generate code based on documentation patterns and best practices';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      task: {
        type: 'string',
        description: 'What the code should do',
      },
      language: {
        type: 'string',
        description: 'Target programming language',
        enum: ['javascript', 'typescript', 'python', 'go', 'java', 'csharp'],
      },
      framework: {
        type: 'string',
        description: 'Framework to use (react, angular, express, etc.)',
      },
      style: {
        type: 'string',
        description: 'Code style preference',
        enum: ['minimal', 'complete', 'production'],
        default: 'complete',
      },
      includeTests: {
        type: 'boolean',
        description: 'Generate unit tests',
        default: false,
      },
      includeComments: {
        type: 'boolean',
        description: 'Include explanatory comments',
        default: true,
      },
    },
    required: ['task', 'language'],
  };

  constructor(
    private vectorStore: VectorStore,
    private embeddingService: EmbeddingService,
    private templateEngine: TemplateEngine
  ) {}

  async execute(params: GenerateCodeParams) {
    try {
      const { task, language, framework, style = 'complete', includeTests, includeComments } = params;

      // Search for relevant documentation and examples
      const query = `${task} ${framework || ''} ${language} implementation example code`;
      const embedding = await this.embeddingService.generateEmbedding(query);
      const searchResults = await this.vectorStore.search(embedding, {
        limit: 20,
        scoreThreshold: 0.6,
      });

      // Extract code examples and patterns
      const examples = this.extractCodeExamples(searchResults.map(r => r.chunk));
      const patterns = this.identifyPatterns(examples, language);

      // Generate the code
      const generatedCode = await this.generateCode({
        task,
        language,
        framework,
        style,
        examples,
        patterns,
        includeComments,
      });

      // Generate tests if requested
      let tests = '';
      if (includeTests) {
        tests = await this.generateTests({
          code: generatedCode.code,
          language,
          framework,
          task,
        });
      }

      // Generate documentation
      const documentation = this.generateDocumentation({
        task,
        code: generatedCode.code,
        language,
        framework,
      });

      return {
        code: generatedCode.code,
        imports: generatedCode.imports,
        tests,
        documentation,
        examples: examples.slice(0, 3).map(e => ({
          code: e.code,
          source: `${e.repository}:${e.filepath}`,
          description: e.description,
        })),
        metadata: {
          language,
          framework,
          style,
          basedOnDocs: searchResults.length,
          confidence: this.calculateConfidence(searchResults),
        },
      };
    } catch (error) {
      logger.error('Code generation failed', { error });
      throw error;
    }
  }

  private extractCodeExamples(chunks: any[]): any[] {
    const examples = [];

    for (const chunk of chunks) {
      if (chunk.type === 'code' || chunk.content.includes('```')) {
        // Extract code blocks
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;
        
        while ((match = codeBlockRegex.exec(chunk.content)) !== null) {
          examples.push({
            language: match[1] || 'unknown',
            code: match[2].trim(),
            repository: chunk.repository,
            filepath: chunk.filepath,
            description: chunk.metadata.title || chunk.metadata.description || '',
            score: chunk.score || 0,
          });
        }
      }
    }

    // Sort by relevance score
    return examples.sort((a, b) => b.score - a.score);
  }

  private identifyPatterns(examples: any[], language: string): any {
    const patterns = {
      imports: new Set<string>(),
      functions: new Map<string, string>(),
      classes: new Map<string, string>(),
      patterns: new Map<string, number>(),
    };

    for (const example of examples) {
      if (example.language === language || example.language === 'unknown') {
        // Extract imports
        const importRegex = this.getImportRegex(language);
        let match;
        while ((match = importRegex.exec(example.code)) !== null) {
          patterns.imports.add(match[0]);
        }

        // Extract function patterns
        const functionRegex = this.getFunctionRegex(language);
        while ((match = functionRegex.exec(example.code)) !== null) {
          const funcName = match[1];
          if (!patterns.functions.has(funcName)) {
            patterns.functions.set(funcName, match[0]);
          }
        }

        // Count common patterns
        const commonPatterns = [
          'async/await',
          'try/catch',
          'error handling',
          'validation',
          'logging',
        ];

        for (const pattern of commonPatterns) {
          if (example.code.toLowerCase().includes(pattern)) {
            patterns.patterns.set(pattern, (patterns.patterns.get(pattern) || 0) + 1);
          }
        }
      }
    }

    return patterns;
  }

  private async generateCode(codeParams: any): Promise<any> {
    const { task, language, framework, style, examples, patterns, includeComments } = codeParams;

    // Build the code structure
    let code = '';
    const imports = new Set<string>();

    // Add imports from patterns
    if (style !== 'minimal') {
      patterns.imports.forEach((imp: string) => imports.add(imp));
    }

    // Generate main code based on task
    if (language === 'typescript' || language === 'javascript') {
      code = this.generateJavaScriptCode({
        task,
        framework,
        style,
        patterns,
        examples,
        includeComments,
      });
    } else if (language === 'python') {
      code = this.generatePythonCode({
        task,
        framework,
        style,
        patterns,
        examples,
        includeComments,
      });
    }
    // Add more languages as needed

    return {
      code,
      imports: Array.from(imports),
    };
  }

  private generateJavaScriptCode(jsParams: any): string {
    const { task, framework, style, patterns, includeComments } = jsParams;
    let code = '';

    // Determine if we should use async/await based on patterns
    const useAsync = patterns.patterns.get('async/await') > 0;
    const useErrorHandling = patterns.patterns.get('try/catch') > 0 || style !== 'minimal';

    // Generate function signature
    const functionName = this.generateFunctionName(task);
    const isAsync = useAsync ? 'async ' : '';
    
    if (includeComments) {
      code += `/**\n * ${task}\n * Generated from documentation patterns\n */\n`;
    }

    code += `${isAsync}function ${functionName}(`;
    
    // Add parameters based on task
    const functionParams = this.extractParameters(task);
    code += functionParams.join(', ');
    code += ') {\n';

    // Add implementation
    if (useErrorHandling && style !== 'minimal') {
      code += '  try {\n';
      code += this.generateImplementation(task, framework, '    ');
      code += '  } catch (error) {\n';
      code += '    console.error(`Error in ${functionName}:`, error);\n';
      code += '    throw error;\n';
      code += '  }\n';
    } else {
      code += this.generateImplementation(task, framework, '  ');
    }

    code += '}\n';

    // Add export based on style
    if (style === 'production') {
      code += `\nexport { ${functionName} };\n`;
    } else if (style === 'complete') {
      code += `\nmodule.exports = { ${functionName} };\n`;
    }

    return code;
  }

  private generatePythonCode(pyParams: any): string {
    const { task, includeComments } = pyParams;
    let code = '';

    const functionName = this.generateFunctionName(task, 'snake_case');
    
    if (includeComments) {
      code += `"""\n${task}\nGenerated from documentation patterns\n"""\n\n`;
    }

    code += `def ${functionName}(`;
    const pyFunctionParams = this.extractParameters(task);
    code += pyFunctionParams.join(', ');
    code += '):\n';
    code += '    # Implementation based on documentation\n';
    code += '    pass\n';

    return code;
  }

  private generateTests(testParams: any): string {
    const { code, language, framework, task } = testParams;
    let tests = '';

    if (language === 'javascript' || language === 'typescript') {
      const functionName = this.generateFunctionName(task);
      tests = `
describe('${functionName}', () => {
  it('should ${task.toLowerCase()}', () => {
    // Test implementation
    expect(${functionName}()).toBeDefined();
  });
});
`;
    }

    return tests;
  }

  private generateDocumentation(docParams: any): string {
    const { task, code, language, framework } = docParams;
    
    return `
# ${task}

## Overview
This code implements: ${task}

## Language
${language}${framework ? ` with ${framework}` : ''}

## Usage
\`\`\`${language}
${code.split('\n').slice(0, 10).join('\n')}
\`\`\`

## Based on Documentation
Generated using patterns from official documentation and best practices.
`;
  }

  private generateFunctionName(task: string, style: string = 'camelCase'): string {
    // Extract action words from task
    const words = task.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Find action verb
    const actionVerbs = ['create', 'get', 'set', 'update', 'delete', 'fetch', 'process', 'handle', 'validate'];
    let verb = actionVerbs.find(v => words.includes(v)) || 'handle';
    
    // Find subject
    const subject = words.find(w => !actionVerbs.includes(w) && w.length > 3) || 'task';

    if (style === 'snake_case') {
      return `${verb}_${subject}`;
    } else {
      return verb + subject.charAt(0).toUpperCase() + subject.slice(1);
    }
  }

  private extractParameters(task: string): string[] {
    // Simple parameter extraction based on task description
    const params = [];
    
    if (task.toLowerCase().includes('user')) {
      params.push('userId');
    }
    if (task.toLowerCase().includes('data')) {
      params.push('data');
    }
    if (task.toLowerCase().includes('options')) {
      params.push('options = {}');
    }
    
    return params.length > 0 ? params : ['input'];
  }

  private generateImplementation(task: string, framework: string | undefined, indent: string): string {
    let impl = '';
    
    // Add basic implementation based on task keywords
    if (task.toLowerCase().includes('fetch') || task.toLowerCase().includes('get')) {
      impl += `${indent}// Fetch data based on documentation patterns\n`;
      impl += `${indent}const response = await fetch(endpoint);\n`;
      impl += `${indent}const data = await response.json();\n`;
      impl += `${indent}return data;\n`;
    } else if (task.toLowerCase().includes('create')) {
      impl += `${indent}// Create resource based on patterns\n`;
      impl += `${indent}const created = { ...input, id: Date.now() };\n`;
      impl += `${indent}return created;\n`;
    } else {
      impl += `${indent}// TODO: Implement based on documentation\n`;
      impl += `${indent}throw new Error('Not implemented');\n`;
    }

    return impl;
  }

  private getImportRegex(language: string): RegExp {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return /^(import\s+.*?from\s+['"].*?['"];?|const\s+.*?=\s*require\s*\(['"].*?['"]\);?)$/gm;
      case 'python':
        return /^(import\s+\w+|from\s+\w+\s+import\s+.*?)$/gm;
      default:
        return /^$/;
    }
  }

  private getFunctionRegex(language: string): RegExp {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return /(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
      case 'python':
        return /def\s+(\w+)\s*\(/g;
      default:
        return /^$/;
    }
  }

  private calculateConfidence(searchResults: any[]): number {
    if (searchResults.length === 0) return 0;
    
    // Calculate average score of top 5 results
    const topResults = searchResults.slice(0, 5);
    const avgScore = topResults.reduce((sum, r) => sum + (r.score || 0), 0) / topResults.length;
    
    // Convert to percentage
    return Math.round(avgScore * 100);
  }
}