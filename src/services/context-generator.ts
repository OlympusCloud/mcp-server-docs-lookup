// import { DocumentChunk } from '../types/document';
import { ContextChunk, ContextResult as ContextResultType } from '../types/context';
import { ContextGenerationConfig, PriorityWeighting } from '../types/config';
import { VectorStore, SearchResult } from './vector-store';
import { EmbeddingService } from './embedding';
import { ProgressiveContextBuilder, ProgressiveContext } from './progressive-context';
import logger from '../utils/logger';

export { ContextChunk };

export interface ContextQuery {
  task: string;
  language?: string;
  framework?: string;
  context?: string;
  maxResults?: number;
  repositories?: string[];
  categories?: string[];
}

export interface ContextResult extends ContextResultType {
  query: ContextQuery;
  strategy: string;
  results: ContextChunk[];
}

export type SearchStrategy = 'semantic' | 'keyword' | 'hybrid';

export class ContextGenerator {
  private vectorStore: VectorStore;
  private embeddingService: EmbeddingService;
  private config: ContextGenerationConfig;
  private priorityWeights: Required<PriorityWeighting>;
  private progressiveContextBuilder: ProgressiveContextBuilder;

  constructor(
    vectorStore: VectorStore,
    embeddingService: EmbeddingService,
    config?: ContextGenerationConfig
  ) {
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.config = {
      strategies: ['hybrid'],
      maxChunks: 20,
      customPrompts: {},
      ...config
    };
    this.priorityWeights = {
      high: 1.5,
      medium: 1.0,
      low: 0.5,
      ...config?.priorityWeighting
    };
    this.progressiveContextBuilder = new ProgressiveContextBuilder();
  }

  async generateContext(query: ContextQuery): Promise<ContextResult> {
    const startTime = Date.now();
    
    logger.info('Generating context', { 
      task: query.task,
      strategy: this.config.strategies?.[0] 
    });

    const strategy = this.selectStrategy(query);
    let results: SearchResult[];

    switch (strategy) {
      case 'semantic':
        results = await this.semanticSearch(query);
        break;
      case 'keyword':
        results = await this.keywordSearch(query);
        break;
      case 'hybrid':
      default:
        results = await this.hybridSearch(query);
        break;
    }

    const contextChunks = this.processResults(results, query);
    const rankedChunks = this.rankResults(contextChunks, query);
    const finalChunks = rankedChunks.slice(0, query.maxResults || this.config.maxChunks);

    const repositories = [...new Set(finalChunks.map(c => c.repository))];
    const categories = [...new Set(finalChunks.map(c => c.metadata.category).filter(Boolean))] as string[];

    const content = finalChunks.map(chunk => chunk.content).join('\n\n');
    
    return {
      content,
      chunks: finalChunks,
      query,
      strategy,
      results: finalChunks,
      metadata: {
        sources: finalChunks.map(chunk => ({
          filepath: chunk.filepath,
          repository: chunk.repository,
          relevance: chunk.score
        })),
        totalChunks: finalChunks.length,
        tokensUsed: finalChunks.reduce((sum, chunk) => sum + chunk.content.length / 4, 0), // Approximate tokens
        strategy,
        timestamp: new Date(),
        totalResults: results.length,
        searchTime: Date.now() - startTime,
        relevantRepositories: repositories,
        suggestedNext: categories,
        confidence: this.calculateConfidence(finalChunks)
      }
    };
  }

  private selectStrategy(query: ContextQuery): SearchStrategy {
    if (this.hasSpecificCodePattern(query.task)) {
      return 'keyword';
    }

    if (this.isConceptualQuery(query.task)) {
      return 'semantic';
    }

    return 'hybrid';
  }

  private hasSpecificCodePattern(task: string): boolean {
    const codePatterns = [
      /function\s+\w+/,
      /class\s+\w+/,
      /interface\s+\w+/,
      /import\s+.+from/,
      /\w+\.\w+\(/,
      /api\s+endpoint/i,
      /error\s+(code|message)/i
    ];

    return codePatterns.some(pattern => pattern.test(task));
  }

  private isConceptualQuery(task: string): boolean {
    const conceptualKeywords = [
      'how to', 'what is', 'explain', 'overview', 'concept',
      'architecture', 'pattern', 'best practice', 'approach',
      'strategy', 'design', 'implement', 'create', 'build'
    ];

    const lowerTask = task.toLowerCase();
    return conceptualKeywords.some(keyword => lowerTask.includes(keyword));
  }

  private async semanticSearch(query: ContextQuery): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddingService.generateEmbedding(
      this.buildSemanticQuery(query)
    );

    const filter = this.buildSearchFilter(query);
    
    return this.vectorStore.search(queryEmbedding, {
      limit: (query.maxResults || this.config.maxChunks || 20) * 2,
      filter
    });
  }

  private async keywordSearch(query: ContextQuery): Promise<SearchResult[]> {
    // Keyword search disabled due to Qdrant API issues
    // Return empty results to allow semantic search to work
    return [];
  }

  private async hybridSearch(query: ContextQuery): Promise<SearchResult[]> {
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query),
      this.keywordSearch(query)
    ]);

    const combinedResults = new Map<string, SearchResult>();
    
    semanticResults.forEach(result => {
      combinedResults.set(result.chunk.id, result);
    });

    keywordResults.forEach(result => {
      const existing = combinedResults.get(result.chunk.id);
      if (existing) {
        existing.score = (existing.score + result.score) / 2;
      } else {
        combinedResults.set(result.chunk.id, result);
      }
    });

    return Array.from(combinedResults.values())
      .sort((a, b) => b.score - a.score);
  }

  private buildSemanticQuery(query: ContextQuery): string {
    const parts = [query.task];

    if (query.language) {
      parts.push(`Programming language: ${query.language}`);
    }

    if (query.framework) {
      parts.push(`Framework: ${query.framework}`);
    }

    if (query.context) {
      parts.push(`Context: ${query.context}`);
    }

    const customPrompt = this.config.customPrompts?.[query.framework || 'default'];
    if (customPrompt) {
      parts.push(customPrompt);
    }

    return parts.join('\n');
  }

  private buildSearchFilter(query: ContextQuery): Record<string, any> {
    const filter: Record<string, any> = {};

    if (query.repositories?.length) {
      filter.repository = query.repositories;
    }

    if (query.categories?.length) {
      filter['metadata.category'] = query.categories;
    }

    if (query.language) {
      filter['metadata.language'] = query.language;
    }

    if (query.framework) {
      filter['metadata.framework'] = query.framework;
    }

    return filter;
  }

  private extractKeywords(task: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that'
    ]);

    const words = task.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    const uniqueWords = [...new Set(words)];
    
    const codeTerms = task.match(/\b\w+(?:\.\w+)+\b/g) || [];
    const camelCaseTerms = task.match(/\b[a-z]+(?:[A-Z][a-z]+)+\b/g) || [];
    
    return [...uniqueWords, ...codeTerms, ...camelCaseTerms];
  }

  private calculateKeywordScore(content: string, keywords: string[]): number {
    const lowerContent = content.toLowerCase();
    let score = 0;
    let matchedKeywords = 0;

    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'g');
      const matches = lowerContent.match(regex);
      if (matches) {
        score += matches.length;
        matchedKeywords++;
      }
    });

    const keywordDensity = matchedKeywords / keywords.length;
    const normalizedScore = Math.min(score / 10, 1);
    
    return (keywordDensity + normalizedScore) / 2;
  }

  private processResults(results: SearchResult[], query: ContextQuery): ContextChunk[] {
    return results.map(result => {
      const priorityWeight = this.priorityWeights[
        result.chunk.metadata.priority as keyof PriorityWeighting || 'medium'
      ];

      return {
        id: result.chunk.id,
        content: result.chunk.content,
        repository: result.chunk.repository,
        filepath: result.chunk.filepath,
        type: result.chunk.type,
        score: result.score * priorityWeight,
        metadata: result.chunk.metadata,
        relevanceExplanation: this.explainRelevance(result, query)
      };
    });
  }

  private rankResults(chunks: ContextChunk[], _query: ContextQuery): ContextChunk[] {
    return chunks.sort((a, b) => {
      const scoreWeight = 0.6;
      const freshnesWeight = 0.2;
      const typeWeight = 0.2;

      const scoreDiff = (b.score - a.score) * scoreWeight;
      
      const aFreshness = a.metadata.lastModified ? 
        new Date(a.metadata.lastModified).getTime() : 0;
      const bFreshness = b.metadata.lastModified ? 
        new Date(b.metadata.lastModified).getTime() : 0;
      const freshnessDiff = ((bFreshness - aFreshness) / 1000000000) * freshnesWeight;

      const typeScores: Record<string, number> = {
        'heading': 0.8,
        'code': 1.0,
        'paragraph': 0.6,
        'list': 0.7,
        'table': 0.7,
        'blockquote': 0.5,
        'other': 0.4
      };
      
      const aTypeScore = typeScores[a.type] || 0.5;
      const bTypeScore = typeScores[b.type] || 0.5;
      const typeDiff = (bTypeScore - aTypeScore) * typeWeight;

      return scoreDiff + freshnessDiff + typeDiff;
    });
  }

  private explainRelevance(result: SearchResult, query: ContextQuery): string {
    const explanations: string[] = [];

    if (result.score > 0.8) {
      explanations.push('High semantic similarity');
    } else if (result.score > 0.6) {
      explanations.push('Good semantic match');
    }

    if (result.chunk.metadata.priority === 'high') {
      explanations.push('High priority content');
    }

    if (query.framework && result.chunk.metadata.framework === query.framework) {
      explanations.push(`Matches framework: ${query.framework}`);
    }

    if (query.language && result.chunk.metadata.language === query.language) {
      explanations.push(`Matches language: ${query.language}`);
    }

    return explanations.join('; ');
  }

  private calculateConfidence(chunks: ContextChunk[]): number {
    if (chunks.length === 0) return 0;
    
    const avgScore = chunks.reduce((sum, chunk) => sum + chunk.score, 0) / chunks.length;
    const hasHighScores = chunks.some(chunk => chunk.score > 0.8);
    const diverseRepositories = new Set(chunks.map(c => c.repository)).size;
    
    let confidence = avgScore * 0.5;
    if (hasHighScores) confidence += 0.3;
    if (diverseRepositories > 1) confidence += 0.2;
    
    return Math.min(1, confidence);
  }

  async generateFormattedContext(query: ContextQuery): Promise<string> {
    const result = await this.generateContext(query);
    const sections: string[] = [];

    sections.push(`# Context for: ${query.task}\n`);
    
    if (result.metadata.relevantRepositories && result.metadata.relevantRepositories.length > 0) {
      sections.push(`## Sources: ${result.metadata.relevantRepositories.join(', ')}\n`);
    }

    const groupedByRepo = new Map<string, ContextChunk[]>();
    result.results.forEach(chunk => {
      const repo = groupedByRepo.get(chunk.repository) || [];
      repo.push(chunk);
      groupedByRepo.set(chunk.repository, repo);
    });

    groupedByRepo.forEach((chunks, repo) => {
      sections.push(`\n## Repository: ${repo}\n`);
      
      chunks.forEach(chunk => {
        sections.push(`### ${chunk.filepath}`);
        if (chunk.metadata.title) {
          sections.push(`**${chunk.metadata.title}**`);
        }
        sections.push('');
        sections.push(chunk.content);
        sections.push('');
        
        if (chunk.relevanceExplanation) {
          sections.push(`*Relevance: ${chunk.relevanceExplanation}*`);
          sections.push('');
        }
      });
    });

    return sections.join('\n');
  }

  async generateProgressiveContext(query: ContextQuery): Promise<ProgressiveContext> {
    const result = await this.generateContext(query);
    return this.progressiveContextBuilder.buildProgressiveContext(
      result.results,
      query
    );
  }

  async generateFormattedProgressiveContext(query: ContextQuery): Promise<string> {
    const progressiveContext = await this.generateProgressiveContext(query);
    return this.progressiveContextBuilder.formatProgressiveContext(progressiveContext);
  }
}

export default ContextGenerator;