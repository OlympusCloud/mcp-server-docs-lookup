import { ContextChunk, ContextQuery } from './context-generator';
// import { DocumentChunk } from '../types/document';
// import logger from '../utils/logger';

export interface ProgressiveContextOptions {
  initialDepth: number;
  maxDepth: number;
  expansionThreshold: number;
  includeRelated: boolean;
}

export interface ProgressiveContext {
  overview: ContextChunk[];
  details: Map<string, ContextChunk[]>;
  related: Map<string, ContextChunk[]>;
  depth: number;
}

export class ProgressiveContextBuilder {
  private options: ProgressiveContextOptions;

  constructor(options?: Partial<ProgressiveContextOptions>) {
    this.options = {
      initialDepth: 1,
      maxDepth: 3,
      expansionThreshold: 0.7,
      includeRelated: true,
      ...options
    };
  }

  buildProgressiveContext(
    chunks: ContextChunk[],
    query: ContextQuery
  ): ProgressiveContext {
    const context: ProgressiveContext = {
      overview: [],
      details: new Map(),
      related: new Map(),
      depth: this.options.initialDepth
    };

    // Group chunks by document and type
    const groupedChunks = this.groupChunks(chunks);

    // Build overview - high-level summaries and headings
    context.overview = this.buildOverview(groupedChunks, query);

    // Build detailed sections for high-scoring chunks
    this.buildDetails(context, groupedChunks, query);

    // Find related content if enabled
    if (this.options.includeRelated) {
      this.buildRelated(context, chunks, query);
    }

    return context;
  }

  private groupChunks(chunks: ContextChunk[]): Map<string, Map<string, ContextChunk[]>> {
    const grouped = new Map<string, Map<string, ContextChunk[]>>();

    chunks.forEach(chunk => {
      const docKey = `${chunk.repository}:${chunk.filepath}`;
      
      if (!grouped.has(docKey)) {
        grouped.set(docKey, new Map());
      }

      const docGroups = grouped.get(docKey)!;
      const typeKey = chunk.type;

      if (!docGroups.has(typeKey)) {
        docGroups.set(typeKey, []);
      }

      docGroups.get(typeKey)!.push(chunk);
    });

    return grouped;
  }

  private buildOverview(
    groupedChunks: Map<string, Map<string, ContextChunk[]>>,
    _query: ContextQuery
  ): ContextChunk[] {
    const overview: ContextChunk[] = [];

    groupedChunks.forEach((docGroups, _docKey) => {
      // Priority for overview: headings > code > paragraphs
      const headings = docGroups.get('heading') || [];
      const code = docGroups.get('code') || [];
      const paragraphs = docGroups.get('paragraph') || [];

      // Add top-scoring heading
      const topHeading = this.getTopScoring(headings, 1);
      if (topHeading.length > 0) {
        overview.push(...topHeading);
      }

      // Add summary paragraph if no heading or score is high
      const topParagraph = this.getTopScoring(paragraphs, 1);
      if (topParagraph.length > 0 && 
          (topHeading.length === 0 || topParagraph[0].score > this.options.expansionThreshold)) {
        overview.push(...this.summarizeChunks(topParagraph));
      }

      // Add code snippet if highly relevant
      const topCode = this.getTopScoring(code, 1);
      if (topCode.length > 0 && topCode[0].score > this.options.expansionThreshold) {
        overview.push(...this.createCodePreview(topCode));
      }
    });

    return overview.sort((a, b) => b.score - a.score);
  }

  private buildDetails(
    context: ProgressiveContext,
    groupedChunks: Map<string, Map<string, ContextChunk[]>>,
    _query: ContextQuery
  ): void {
    groupedChunks.forEach((docGroups, docKey) => {
      const allChunks: ContextChunk[] = [];
      
      docGroups.forEach(chunks => {
        allChunks.push(...chunks);
      });

      // Find chunks that meet expansion threshold
      const expandableChunks = allChunks.filter(
        chunk => chunk.score >= this.options.expansionThreshold
      );

      if (expandableChunks.length > 0) {
        // Group by parent-child relationships if available
        const hierarchical = this.buildHierarchy(expandableChunks);
        context.details.set(docKey, hierarchical);
      }
    });
  }

  private buildRelated(
    context: ProgressiveContext,
    allChunks: ContextChunk[],
    _query: ContextQuery
  ): void {
    // Find chunks that are conceptually related but have lower scores
    const relatedThreshold = this.options.expansionThreshold * 0.7;
    
    const relatedChunks = allChunks.filter(chunk => 
      chunk.score >= relatedThreshold && 
      chunk.score < this.options.expansionThreshold
    );

    // Group by category or framework
    const relatedGroups = new Map<string, ContextChunk[]>();
    
    relatedChunks.forEach(chunk => {
      const category = chunk.metadata.category || chunk.metadata.framework || 'general';
      
      if (!relatedGroups.has(category)) {
        relatedGroups.set(category, []);
      }
      
      relatedGroups.get(category)!.push(chunk);
    });

    // Add top related from each category
    relatedGroups.forEach((chunks, category) => {
      const topRelated = this.getTopScoring(chunks, 3);
      if (topRelated.length > 0) {
        context.related.set(category, topRelated);
      }
    });
  }

  private buildHierarchy(chunks: ContextChunk[]): ContextChunk[] {
    const hierarchical: ContextChunk[] = [];
    const chunkMap = new Map<string, ContextChunk>();

    // Build chunk map
    chunks.forEach(chunk => {
      if (chunk.metadata.chunkId) {
        chunkMap.set(chunk.metadata.chunkId, chunk);
      }
    });

    // Build hierarchy
    chunks.forEach(chunk => {
      if (!chunk.metadata.parentChunkId) {
        // Top-level chunk
        hierarchical.push(chunk);
        this.addChildren(chunk, chunkMap, hierarchical);
      }
    });

    // Add orphaned chunks
    chunks.forEach(chunk => {
      if (!hierarchical.includes(chunk)) {
        hierarchical.push(chunk);
      }
    });

    return hierarchical;
  }

  private addChildren(
    parent: ContextChunk,
    chunkMap: Map<string, ContextChunk>,
    result: ContextChunk[]
  ): void {
    const childIds = parent.metadata.childChunkIds || [];
    
    childIds.forEach((childId: string) => {
      const child = chunkMap.get(childId);
      if (child && child.score >= this.options.expansionThreshold * 0.8) {
        result.push(child);
        this.addChildren(child, chunkMap, result);
      }
    });
  }

  private getTopScoring(chunks: ContextChunk[], limit: number): ContextChunk[] {
    return chunks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private summarizeChunks(chunks: ContextChunk[]): ContextChunk[] {
    return chunks.map(chunk => {
      const lines = chunk.content.split('\n');
      const summary = lines.slice(0, 3).join('\n');
      
      return {
        ...chunk,
        content: summary + (lines.length > 3 ? '\n...' : ''),
        metadata: {
          ...chunk.metadata,
          summarized: true,
          originalLength: chunk.content.length
        }
      };
    });
  }

  private createCodePreview(chunks: ContextChunk[]): ContextChunk[] {
    return chunks.map(chunk => {
      const lines = chunk.content.split('\n');
      const preview = this.extractCodeSignature(lines);
      
      return {
        ...chunk,
        content: preview,
        metadata: {
          ...chunk.metadata,
          preview: true,
          originalLength: chunk.content.length
        }
      };
    });
  }

  private extractCodeSignature(lines: string[]): string {
    // Extract function/class signatures
    const signatures: string[] = [];
    let currentSignature: string[] = [];
    let inSignature = false;

    for (const line of lines) {
      if (this.isSignatureStart(line)) {
        if (currentSignature.length > 0) {
          signatures.push(currentSignature.join('\n'));
        }
        currentSignature = [line];
        inSignature = true;
      } else if (inSignature) {
        if (line.includes('{') || line.includes(':') || line.trim() === '') {
          currentSignature.push(line);
          signatures.push(currentSignature.join('\n'));
          currentSignature = [];
          inSignature = false;
        } else {
          currentSignature.push(line);
        }
      }
    }

    if (currentSignature.length > 0) {
      signatures.push(currentSignature.join('\n'));
    }

    return signatures.slice(0, 3).join('\n\n') || lines.slice(0, 5).join('\n');
  }

  private isSignatureStart(line: string): boolean {
    const patterns = [
      /^\s*(export\s+)?(async\s+)?function\s+/,
      /^\s*(export\s+)?(const|let|var)\s+\w+\s*=/,
      /^\s*(export\s+)?class\s+/,
      /^\s*(public|private|protected)\s+/,
      /^\s*def\s+/,
      /^\s*func\s+/,
      /^\s*interface\s+/,
      /^\s*type\s+/
    ];

    return patterns.some(pattern => pattern.test(line));
  }

  formatProgressiveContext(context: ProgressiveContext): string {
    const sections: string[] = [];

    // Overview section
    if (context.overview.length > 0) {
      sections.push('## Overview\n');
      context.overview.forEach(chunk => {
        sections.push(this.formatChunk(chunk, 0));
      });
    }

    // Detailed sections
    if (context.details.size > 0) {
      sections.push('\n## Detailed Information\n');
      
      context.details.forEach((chunks, docKey) => {
        const [repo, filepath] = docKey.split(':');
        sections.push(`### ${repo} - ${filepath}\n`);
        
        chunks.forEach(chunk => {
          sections.push(this.formatChunk(chunk, 1));
        });
      });
    }

    // Related content
    if (context.related.size > 0) {
      sections.push('\n## Related Documentation\n');
      
      context.related.forEach((chunks, category) => {
        sections.push(`### ${category}\n`);
        
        chunks.forEach(chunk => {
          sections.push(this.formatChunk(chunk, 1, true));
        });
      });
    }

    return sections.join('\n');
  }

  private formatChunk(chunk: ContextChunk, indent: number = 0, brief: boolean = false): string {
    const prefix = '  '.repeat(indent);
    const lines: string[] = [];

    if (chunk.type === 'heading') {
      lines.push(`${prefix}**${chunk.content}**`);
    } else if (chunk.type === 'code') {
      lines.push(`${prefix}\`\`\`${chunk.metadata.language || ''}`);
      lines.push(...chunk.content.split('\n').map(line => prefix + line));
      lines.push(`${prefix}\`\`\``);
    } else {
      lines.push(...chunk.content.split('\n').map(line => prefix + line));
    }

    if (!brief && chunk.relevanceExplanation) {
      lines.push(`${prefix}*${chunk.relevanceExplanation}*`);
    }

    lines.push('');
    return lines.join('\n');
  }
}

export default ProgressiveContextBuilder;