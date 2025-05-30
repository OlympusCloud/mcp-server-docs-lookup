import { DocumentChunk } from '../types/document';
import * as ts from 'typescript';
import { ESLint } from 'eslint';
import Ajv from 'ajv';
import logger from '../utils/logger';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: CodeSuggestion[];
  score: number; // 0-100
}

export interface ValidationError {
  line: number;
  column: number;
  message: string;
  rule: string;
  severity: 'error' | 'critical';
  fix?: CodeFix;
}

export interface ValidationWarning {
  line: number;
  column: number;
  message: string;
  rule: string;
  fix?: CodeFix;
}

export interface CodeSuggestion {
  type: 'performance' | 'security' | 'style' | 'best-practice';
  message: string;
  example?: string;
  documentation?: string;
}

export interface CodeFix {
  range: { start: number; end: number };
  text: string;
  description: string;
}

export interface ValidationConfig {
  enableTypeChecking?: boolean;
  enableSecurityScanning?: boolean;
  enablePerformanceChecks?: boolean;
  customRules?: CustomRule[];
  apiSchemas?: Record<string, any>;
  codingStandards?: CodingStandards;
}

export interface CustomRule {
  name: string;
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
  fix?: (match: RegExpMatchArray) => string;
}

export interface CodingStandards {
  namingConventions?: NamingConventions;
  maxLineLength?: number;
  maxComplexity?: number;
  requiredHeaders?: string[];
  forbiddenPatterns?: string[];
}

interface NamingConventions {
  functions?: 'camelCase' | 'snake_case' | 'PascalCase';
  variables?: 'camelCase' | 'snake_case' | 'SCREAMING_SNAKE_CASE';
  classes?: 'PascalCase' | 'snake_case';
  interfaces?: 'PascalCase' | 'IPascalCase';
  files?: 'kebab-case' | 'snake_case' | 'camelCase';
}

export class CodeValidator {
  private eslint: ESLint;
  private ajv: Ajv;
  private config: ValidationConfig;
  private documentContext: Map<string, DocumentChunk[]> = new Map();

  constructor(config: ValidationConfig = {}) {
    this.config = config;
    this.eslint = new ESLint({
      overrideConfig: {
        rules: {
          ...this.buildESLintRules(),
          'no-unused-vars': 'error',
          'no-undef': 'error',
        },
      } as any,
    });
    this.ajv = new Ajv({ allErrors: true, verbose: true });
  }

  /**
   * Validate code against documentation and standards
   */
  async validateCode(
    code: string,
    language: string,
    relatedDocs: DocumentChunk[]
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: CodeSuggestion[] = [];

    // Store documentation context
    this.documentContext.set('current', relatedDocs);

    try {
      // 1. Syntax validation
      const syntaxErrors = await this.validateSyntax(code, language);
      errors.push(...syntaxErrors);

      // 2. Linting and style checks
      if (language === 'javascript' || language === 'typescript') {
        const lintResults = await this.runESLint(code);
        this.processLintResults(lintResults, errors, warnings);
      }

      // 3. API contract validation
      if (this.config.apiSchemas) {
        const apiErrors = await this.validateAPIUsage(code, this.config.apiSchemas);
        errors.push(...apiErrors);
      }

      // 4. Documentation compliance
      const complianceIssues = await this.checkDocumentationCompliance(code, relatedDocs);
      warnings.push(...complianceIssues);

      // 5. Security scanning
      if (this.config.enableSecurityScanning) {
        const securityIssues = await this.scanForSecurityIssues(code);
        errors.push(...securityIssues);
      }

      // 6. Performance analysis
      if (this.config.enablePerformanceChecks) {
        const perfSuggestions = await this.analyzePerformance(code, language);
        suggestions.push(...perfSuggestions);
      }

      // 7. Custom rules
      if (this.config.customRules) {
        const customIssues = this.applyCustomRules(code, this.config.customRules);
        errors.push(...customIssues.errors);
        warnings.push(...customIssues.warnings);
      }

      // Calculate compliance score
      const score = this.calculateComplianceScore(errors, warnings, suggestions);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        score,
      };
    } catch (error) {
      logger.error('Code validation failed', { error });
      return {
        valid: false,
        errors: [{
          line: 0,
          column: 0,
          message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          rule: 'validator-error',
          severity: 'critical',
        }],
        warnings: [],
        suggestions: [],
        score: 0,
      };
    }
  }

  /**
   * Validate syntax based on language
   */
  private async validateSyntax(code: string, language: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    switch (language) {
      case 'typescript':
      case 'javascript': {
        try {
          const sourceFile = ts.createSourceFile(
            'temp.ts',
            code,
            ts.ScriptTarget.Latest,
            true
          );
          
          // Check for syntax errors
          if ((sourceFile as any).parseDiagnostics?.length > 0) {
            (sourceFile as any).parseDiagnostics.forEach((diagnostic: ts.Diagnostic) => {
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start || 0);
              errors.push({
                line: line + 1,
                column: character + 1,
                message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                rule: 'syntax-error',
                severity: 'error',
              });
            });
          }
        } catch (error) {
          errors.push({
            line: 0,
            column: 0,
            message: `Syntax error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            rule: 'parse-error',
            severity: 'critical',
          });
        }
        break;
      }
      
      case 'graphql': {
        // Basic GraphQL validation - check for common patterns
        try {
          if (!code.trim().match(/^(query|mutation|subscription|fragment|schema|type|input|enum|union|interface|directive)\s/)) {
            errors.push({
              line: 1,
              column: 1,
              message: 'GraphQL code should start with a valid definition (query, mutation, type, etc.)',
              rule: 'graphql-definition',
              severity: 'error',
            });
          }
        } catch (error) {
          errors.push({
            line: 0,
            column: 0,
            message: `GraphQL validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            rule: 'graphql-syntax',
            severity: 'error',
          });
        }
        break;
      }
      
      // Add more language support as needed
    }

    return errors;
  }

  /**
   * Run ESLint on JavaScript/TypeScript code
   */
  private async runESLint(code: string): Promise<ESLint.LintResult[]> {
    return await this.eslint.lintText(code);
  }

  /**
   * Process ESLint results into errors and warnings
   */
  private processLintResults(
    results: ESLint.LintResult[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    for (const result of results) {
      for (const message of result.messages) {
        const issue = {
          line: message.line,
          column: message.column,
          message: message.message,
          rule: message.ruleId || 'eslint',
          fix: message.fix ? {
            range: { start: message.fix.range[0], end: message.fix.range[1] },
            text: message.fix.text,
            description: `Fix: ${message.message}`,
          } : undefined,
        };

        if (message.severity === 2) {
          errors.push({ ...issue, severity: 'error' });
        } else {
          warnings.push(issue);
        }
      }
    }
  }

  /**
   * Validate API usage against schemas
   */
  private async validateAPIUsage(
    code: string,
    schemas: Record<string, any>
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Extract API calls from code
    const apiCalls = this.extractAPICalls(code);

    for (const call of apiCalls) {
      const schema = schemas[call.endpoint];
      if (schema) {
        const validate = this.ajv.compile(schema);
        
        if (!validate(call.payload)) {
          errors.push({
            line: call.line,
            column: call.column,
            message: `API validation failed: ${this.ajv.errorsText(validate.errors)}`,
            rule: 'api-contract',
            severity: 'error',
          });
        }
      }
    }

    return errors;
  }

  /**
   * Check if code follows documentation patterns
   */
  private async checkDocumentationCompliance(
    code: string,
    docs: DocumentChunk[]
  ): Promise<ValidationWarning[]> {
    const warnings: ValidationWarning[] = [];

    // Extract patterns from documentation
    const patterns = this.extractPatternsFromDocs(docs);

    // Check if code follows documented patterns
    for (const pattern of patterns) {
      if (pattern.required && !code.includes(pattern.code)) {
        warnings.push({
          line: 0,
          column: 0,
          message: `Missing required pattern from documentation: ${pattern.description}`,
          rule: 'doc-compliance',
        });
      }
    }

    return warnings;
  }

  /**
   * Scan for security issues
   */
  private async scanForSecurityIssues(code: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    
    // Common security patterns to check
    const securityPatterns = [
      {
        pattern: /eval\s*\(/g,
        message: 'Avoid using eval() - it can execute arbitrary code',
        rule: 'no-eval',
      },
      {
        pattern: /innerHTML\s*=/g,
        message: 'Avoid innerHTML - use textContent or sanitize input',
        rule: 'no-inner-html',
      },
      {
        pattern: /(password|secret|key|token)\s*=\s*["'][^"']+["']/gi,
        message: 'Potential hardcoded secret detected',
        rule: 'no-hardcoded-secrets',
      },
      {
        pattern: /require\s*\(\s*[`'"]\s*\$\{[^}]+\}\s*[`'"]\s*\)/g,
        message: 'Dynamic require() can be a security risk',
        rule: 'no-dynamic-require',
      },
    ];

    for (const { pattern, message, rule } of securityPatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const lines = code.substring(0, match.index).split('\n');
        errors.push({
          line: lines.length,
          column: lines[lines.length - 1].length + 1,
          message,
          rule,
          severity: 'critical',
        });
      }
    }

    return errors;
  }

  /**
   * Analyze performance issues
   */
  private async analyzePerformance(
    code: string,
    language: string
  ): Promise<CodeSuggestion[]> {
    const suggestions: CodeSuggestion[] = [];

    if (language === 'javascript' || language === 'typescript') {
      // Check for common performance issues
      if (/\.forEach\s*\([^)]+\)\s*{[^}]*\.push\s*\(/.test(code)) {
        suggestions.push({
          type: 'performance',
          message: 'Consider using map() instead of forEach() with push()',
          example: 'const results = items.map(item => transform(item));',
        });
      }

      if (/for\s*\([^)]+in\s+/.test(code) && code.includes('array')) {
        suggestions.push({
          type: 'performance',
          message: 'Avoid for...in loops with arrays, use for...of or traditional for loop',
          example: 'for (const item of array) { ... }',
        });
      }

      if (/JSON\.parse\s*\(JSON\.stringify\s*\(/.test(code)) {
        suggestions.push({
          type: 'performance',
          message: 'Deep cloning with JSON.parse/stringify is inefficient for large objects',
          example: 'Consider using a dedicated cloning library like lodash.cloneDeep',
        });
      }
    }

    return suggestions;
  }

  /**
   * Apply custom validation rules
   */
  private applyCustomRules(
    code: string,
    rules: CustomRule[]
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const rule of rules) {
      let match;
      while ((match = rule.pattern.exec(code)) !== null) {
        const lines = code.substring(0, match.index).split('\n');
        const issue = {
          line: lines.length,
          column: lines[lines.length - 1].length + 1,
          message: rule.message,
          rule: rule.name,
          fix: rule.fix ? {
            range: { start: match.index, end: match.index + match[0].length },
            text: rule.fix(match),
            description: `Apply fix for ${rule.name}`,
          } : undefined,
        };

        if (rule.severity === 'error') {
          errors.push({ ...issue, severity: 'error' });
        } else {
          warnings.push(issue);
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Calculate overall compliance score
   */
  private calculateComplianceScore(
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: CodeSuggestion[]
  ): number {
    let score = 100;

    // Deduct points for issues
    score -= errors.filter(e => e.severity === 'critical').length * 20;
    score -= errors.filter(e => e.severity === 'error').length * 10;
    score -= warnings.length * 5;
    score -= suggestions.length * 2;

    return Math.max(0, score);
  }

  /**
   * Extract API calls from code (simplified)
   */
  private extractAPICalls(code: string): Array<{
    endpoint: string;
    payload: any;
    line: number;
    column: number;
  }> {
    // This is a simplified implementation
    // In production, use proper AST parsing
    const calls: Array<{ endpoint: string; payload: any; line: number; column: number }> = [];
    
    // Match fetch() calls
    const fetchPattern = /fetch\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*({[^}]+})\s*\)/g;
    let match;
    
    while ((match = fetchPattern.exec(code)) !== null) {
      try {
        const lines = code.substring(0, match.index).split('\n');
        calls.push({
          endpoint: match[1],
          payload: JSON.parse(match[2]),
          line: lines.length,
          column: lines[lines.length - 1].length + 1,
        });
      } catch (e) {
        // Skip if can't parse
      }
    }

    return calls;
  }

  /**
   * Extract patterns from documentation
   */
  private extractPatternsFromDocs(docs: DocumentChunk[]): Array<{
    code: string;
    description: string;
    required: boolean;
  }> {
    const patterns: Array<{ code: string; description: string; required: boolean }> = [];

    for (const doc of docs) {
      // Look for code blocks in documentation
      const codeBlockPattern = /```[a-zA-Z]*\n([\s\S]*?)```/g;
      let match;
      
      while ((match = codeBlockPattern.exec(doc.content)) !== null) {
        patterns.push({
          code: match[1].trim(),
          description: doc.metadata.title || 'Documented pattern',
          required: doc.content.toLowerCase().includes('required') ||
                   doc.content.toLowerCase().includes('must'),
        });
      }
    }

    return patterns;
  }

  /**
   * Build ESLint rules from configuration
   */
  private buildESLintRules(): Record<string, any> {
    const rules: Record<string, any> = {};

    if (this.config.codingStandards) {
      if (this.config.codingStandards.maxLineLength) {
        rules['max-len'] = ['error', { code: this.config.codingStandards.maxLineLength }];
      }
      
      if (this.config.codingStandards.maxComplexity) {
        rules['complexity'] = ['error', this.config.codingStandards.maxComplexity];
      }

      if (this.config.codingStandards.namingConventions?.functions === 'camelCase') {
        rules['camelcase'] = ['error', { properties: 'always' }];
      }
    }

    return rules;
  }
}