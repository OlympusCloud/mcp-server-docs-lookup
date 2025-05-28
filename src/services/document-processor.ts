// import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
// import { marked } from 'marked';
import * as yaml from 'yaml';
import { 
  Document, 
  DocumentChunk, 
  DocumentType,
  DocumentMetadata,
  ChunkingStrategy,
  ProcessingResult 
} from '../types/document';
import { RepositoryConfig } from '../types/config';
import { PerformanceMonitorService } from './performance-monitor';
import logger from '../utils/logger';
import { DocumentProcessingError } from '../utils/errors';
import { SecurityValidator } from '../utils/security';

export class DocumentProcessor {
  private chunkingStrategy: ChunkingStrategy;
  private performanceMonitor?: PerformanceMonitorService;

  constructor(chunkingStrategy?: Partial<ChunkingStrategy>, performanceMonitor?: PerformanceMonitorService) {
    this.chunkingStrategy = {
      maxChunkSize: 2000,  // Increased for better context
      overlapSize: 300,    // Increased overlap for continuity
      respectBoundaries: true,
      preserveContext: true,
      ...chunkingStrategy
    };
    this.performanceMonitor = performanceMonitor;
  }

  async processDocument(
    filepath: string,
    content: string,
    repository: RepositoryConfig
  ): Promise<ProcessingResult> {
    try {
      // Validate filepath for path traversal and security
      for (const pattern of [/\.\./, /~\//, /\0/, /%2e%2e/i]) {
        if (pattern.test(filepath)) {
          throw new DocumentProcessingError(`Invalid file path detected: ${filepath}`);
        }
      }
      
      // Validate and sanitize filepath
      SecurityValidator.validateFileName(filepath);
      
      // Sanitize content to remove any potential security issues
      const sanitizedContent = SecurityValidator.sanitizeInput(content, 1000000); // 1MB max
      
      const documentType = this.detectDocumentType(filepath);
      const metadata = await this.extractMetadata(sanitizedContent, documentType);
      const sanitizedMetadata = SecurityValidator.sanitizeMetadata(metadata);
      
      const documentId = this.generateDocumentId(repository.name, filepath);
      const hash = this.generateHash(sanitizedContent);

      const document: Document = {
        id: documentId,
        repository: repository.name,
        filepath,
        content: sanitizedContent,
        type: documentType,
        metadata: {
          ...sanitizedMetadata,
          category: repository.category,
          priority: repository.priority,
          branch: repository.branch,
          ...repository.metadata
        },
        chunks: [],
        lastModified: new Date(),
        hash
      };

      const chunks = await this.chunkDocument(document);
      document.chunks = chunks;

      if (this.performanceMonitor) {
        this.performanceMonitor.updateApplicationMetrics({ 
          documentsIndexed: 1,
          chunksProcessed: chunks.length 
        });
      }

      return { document, chunks };
    } catch (error) {
      throw new DocumentProcessingError(
        `Failed to process document: ${filepath}`,
        { filepath, error }
      );
    }
  }

  private detectDocumentType(filepath: string): DocumentType {
    const ext = path.extname(filepath).toLowerCase();
    const filename = path.basename(filepath).toLowerCase();

    const typeMap: Record<string, DocumentType> = {
      '.md': DocumentType.MARKDOWN,
      '.markdown': DocumentType.MARKDOWN,
      '.rst': DocumentType.RESTRUCTURED_TEXT,
      '.html': DocumentType.HTML,
      '.htm': DocumentType.HTML,
      '.js': DocumentType.JAVASCRIPT,
      '.jsx': DocumentType.JAVASCRIPT,
      '.ts': DocumentType.TYPESCRIPT,
      '.tsx': DocumentType.TYPESCRIPT,
      '.py': DocumentType.PYTHON,
      '.java': DocumentType.JAVA,
      '.cs': DocumentType.CSHARP,
      '.go': DocumentType.GO,
      '.rs': DocumentType.RUST,
      '.yaml': DocumentType.YAML,
      '.yml': DocumentType.YAML,
      '.json': DocumentType.JSON,
      '.xml': DocumentType.XML,
      '.txt': DocumentType.PLAIN_TEXT
    };

    if (filename === 'readme' && !ext) {
      return DocumentType.MARKDOWN;
    }

    return typeMap[ext] || DocumentType.UNKNOWN;
  }

  private async extractMetadata(
    content: string,
    documentType: DocumentType
  ): Promise<DocumentMetadata> {
    const metadata: DocumentMetadata = {};

    if (documentType === DocumentType.MARKDOWN) {
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        try {
          const frontmatter = yaml.parse(frontmatterMatch[1]);
          Object.assign(metadata, frontmatter);
        } catch (error) {
          logger.warn('Failed to parse frontmatter', { error });
        }
      }

      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch && !metadata.title) {
        metadata.title = titleMatch[1];
      }
    }
    
    if (documentType === DocumentType.RESTRUCTURED_TEXT) {
      // RST title format: Title text followed by underline with = or other characters
      const rstTitleMatch = content.match(/^(.+)\n[=~`!@#$%^&*()_+\-[\]{}\\|;':",./<>?]+\s*$/m);
      if (rstTitleMatch && !metadata.title) {
        metadata.title = rstTitleMatch[1].trim();
      }
    }

    if (documentType === DocumentType.HTML) {
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      if (titleMatch) {
        metadata.title = titleMatch[1];
      }

      const descMatch = content.match(/<meta\s+name="description"\s+content="(.*?)"/i);
      if (descMatch) {
        metadata.description = descMatch[1];
      }
    }

    return metadata;
  }

  private async chunkDocument(document: Document): Promise<DocumentChunk[]> {
    switch (document.type) {
      case DocumentType.MARKDOWN:
        return this.chunkMarkdown(document);
      case DocumentType.RESTRUCTURED_TEXT:
        return this.chunkRestructuredText(document);
      case DocumentType.HTML:
        return this.chunkHTML(document);
      case DocumentType.JAVASCRIPT:
      case DocumentType.TYPESCRIPT:
      case DocumentType.PYTHON:
      case DocumentType.JAVA:
      case DocumentType.CSHARP:
      case DocumentType.GO:
      case DocumentType.RUST:
        return this.chunkCode(document);
      case DocumentType.YAML:
      case DocumentType.JSON:
        return this.chunkStructured(document);
      default:
        return this.chunkPlainText(document);
    }
  }

  private chunkMarkdown(document: Document): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const lines = document.content.split('\n');
    
    let currentChunk: string[] = [];
    let currentType: DocumentChunk['type'] = 'paragraph';
    let startLine = 0;
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockStart = 0;
    const currentHeadingContext: string[] = [];

    const flushChunk = () => {
      if (currentChunk.length > 0) {
        const content = currentChunk.join('\n').trim();
        if (content) {
          // Add heading context for better semantic understanding
          const metadata: any = {};
          if (currentHeadingContext.length > 0 && currentType !== 'heading') {
            metadata.headingContext = currentHeadingContext.join(' > ');
          }
          
          // For heading chunks, extract section name
          if (currentType === 'heading') {
            const headingMatch = content.match(/^#+\s+(.+)$/);
            if (headingMatch) {
              metadata.section = headingMatch[1].trim();
            }
          }
          
          chunks.push(this.createChunk(
            document,
            content,
            currentType,
            startLine,
            startLine + currentChunk.length - 1,
            metadata
          ));
        }
        currentChunk = [];
      }
    };

    const flushCodeBlock = () => {
      if (codeBlockLines.length > 0) {
        const content = codeBlockLines.join('\n');
        const metadata: any = {};
        if (currentHeadingContext.length > 0) {
          metadata.headingContext = currentHeadingContext.join(' > ');
        }
        
        chunks.push(this.createChunk(
          document,
          content,
          'code',
          codeBlockStart,
          codeBlockStart + codeBlockLines.length - 1,
          metadata
        ));
        codeBlockLines = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.match(/^```/)) {
        if (inCodeBlock) {
          codeBlockLines.push(line);
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          flushChunk();
          inCodeBlock = true;
          codeBlockStart = i;
          codeBlockLines = [line];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      if (line.match(/^#{1,6}\s+/)) {
        flushChunk();
        currentType = 'heading';
        startLine = i;
        currentChunk = [line];
        
        // Update heading context
        const level = this.getHeadingLevel(line);
        const headingText = line.replace(/^#+\s+/, '').trim();
        
        // Remove deeper level headings from context
        while (currentHeadingContext.length >= level) {
          currentHeadingContext.pop();
        }
        currentHeadingContext.push(headingText);
        
        flushChunk();
        currentType = 'paragraph';
      } else if (line.match(/^[-*+]\s+/) || line.match(/^\d+\.\s+/)) {
        if (currentType !== 'list') {
          flushChunk();
          currentType = 'list';
          startLine = i;
        }
        currentChunk.push(line);
      } else if (line.match(/^>\s+/)) {
        if (currentType !== 'blockquote') {
          flushChunk();
          currentType = 'blockquote';
          startLine = i;
        }
        currentChunk.push(line);
      } else if (line.match(/^\|/)) {
        if (currentType !== 'table') {
          flushChunk();
          currentType = 'table';
          startLine = i;
        }
        currentChunk.push(line);
      } else if (line.trim() === '') {
        flushChunk();
      } else {
        if (currentType !== 'paragraph') {
          flushChunk();
          currentType = 'paragraph';
          startLine = i;
        }
        
        // Handle very long lines by splitting them
        if (line.length > this.chunkingStrategy.maxChunkSize) {
          flushChunk(); // Flush any existing content
          
          // Split the long line into smaller chunks
          let linePos = 0;
          while (linePos < line.length) {
            const chunkSize = Math.min(
              this.chunkingStrategy.maxChunkSize,
              line.length - linePos
            );
            const lineChunk = line.substring(linePos, linePos + chunkSize);
            
            // Create chunk for this piece
            chunks.push(this.createChunk(
              document,
              lineChunk,
              'paragraph',
              i,
              i,
              {}
            ));
            
            linePos += chunkSize - this.chunkingStrategy.overlapSize;
            if (linePos < 0) linePos = chunkSize; // Prevent infinite loop
          }
        } else {
          currentChunk.push(line);
        }
      }

      if (currentChunk.join('\n').length > this.chunkingStrategy.maxChunkSize) {
        // Smart chunking with overlap
        if (this.chunkingStrategy.overlapSize > 0 && currentChunk.length > 1) {
          const overlapLines = Math.ceil(this.chunkingStrategy.overlapSize / 80);
          const preservedLines = currentChunk.slice(-Math.min(overlapLines, Math.max(1, currentChunk.length - 1)));
          flushChunk();
          currentChunk = preservedLines;
          startLine = i - preservedLines.length + 1;
        } else {
          flushChunk();
        }
      }
    }

    flushChunk();
    if (inCodeBlock) {
      flushCodeBlock();
    }

    return this.establishChunkRelationships(this.enhanceChunksWithContext(chunks, document));
  }

  private chunkRestructuredText(document: Document): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const lines = document.content.split('\n');
    
    let currentChunk: string[] = [];
    let currentType: DocumentChunk['type'] = 'paragraph';
    let startLine = 0;
    let inCodeBlock = false;
    let inDirective = false;

    const flushChunk = () => {
      if (currentChunk.length > 0) {
        const content = currentChunk.join('\n').trim();
        if (content) {
          chunks.push(this.createChunk(
            document,
            content,
            currentType,
            startLine,
            startLine + currentChunk.length - 1
          ));
        }
        currentChunk = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      // RST title detection (underlined with =, -, ~, etc.)
      if (nextLine && /^[=\-~`'"^_*+#]+$/.test(nextLine) && 
          nextLine.length >= line.length && line.trim().length > 0) {
        flushChunk();
        currentType = 'heading';
        startLine = i;
        currentChunk = [line, nextLine];
        i++; // Skip the underline
        flushChunk();
        currentType = 'paragraph';
        continue;
      }

      // Code block detection (:: followed by indented block)
      if (line.trim().endsWith('::')) {
        flushChunk();
        inCodeBlock = true;
        currentType = 'code';
        startLine = i;
        currentChunk = [line];
        continue;
      }

      // Directive detection (.. directive::)
      if (line.match(/^\.\.\s+\w+::/)) {
        flushChunk();
        inDirective = true;
        currentType = 'other';
        startLine = i;
        currentChunk = [line];
        continue;
      }

      // End of code block or directive (non-indented line)
      if ((inCodeBlock || inDirective) && line.length > 0 && !line.match(/^\s/)) {
        flushChunk();
        inCodeBlock = false;
        inDirective = false;
        currentType = 'paragraph';
        startLine = i;
      }

      // List detection
      if (line.match(/^[*\-+]\s+/) || line.match(/^\d+\.\s+/)) {
        if (currentType !== 'list') {
          flushChunk();
          currentType = 'list';
          startLine = i;
        }
      }

      currentChunk.push(line);

      if (currentChunk.join('\n').length > this.chunkingStrategy.maxChunkSize) {
        flushChunk();
      }
    }

    flushChunk();
    return chunks;
  }

  private chunkHTML(document: Document): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    // Simple HTML parsing - in production, use a proper HTML parser
    const htmlContent = document.content;
    
    // Extract text content from HTML
    const textContent = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\n\s*\n/g, '\n\n');

    // Extract headings
    const headingMatches = htmlContent.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi);
    const headings: Array<{level: number, text: string, index: number}> = [];
    
    for (const match of headingMatches) {
      headings.push({
        level: parseInt(match[1]),
        text: match[2].replace(/<[^>]+>/g, '').trim(),
        index: match.index || 0
      });
    }

    // Sort headings by position
    headings.sort((a, b) => a.index - b.index);

    // Create chunks based on headings and content
    let lastIndex = 0;
    
    headings.forEach((heading, _i) => {
      // Add content before heading
      const beforeContent = textContent.substring(lastIndex, heading.index).trim();
      if (beforeContent) {
        chunks.push(this.createChunk(
          document,
          beforeContent,
          'paragraph'
        ));
      }

      // Add heading
      chunks.push(this.createChunk(
        document,
        heading.text,
        'heading',
        undefined,
        undefined,
        { level: heading.level }
      ));

      lastIndex = heading.index;
    });

    // Add remaining content
    const remainingContent = textContent.substring(lastIndex).trim();
    if (remainingContent) {
      const remainingChunks = this.chunkPlainText({
        ...document,
        content: remainingContent
      });
      chunks.push(...remainingChunks);
    }

    return chunks;
  }

  private chunkCode(document: Document): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const lines = document.content.split('\n');
    
    let currentFunction: string[] = [];
    let functionStart = 0;
    let inFunction = false;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (this.isFunctionDeclaration(line, document.type)) {
        if (currentFunction.length > 0) {
          chunks.push(this.createChunk(
            document,
            currentFunction.join('\n'),
            'code',
            functionStart,
            i - 1
          ));
        }
        currentFunction = [line];
        functionStart = i;
        inFunction = true;
        braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      } else if (inFunction) {
        currentFunction.push(line);
        braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        
        if (braceCount === 0 && line.includes('}')) {
          chunks.push(this.createChunk(
            document,
            currentFunction.join('\n'),
            'code',
            functionStart,
            i
          ));
          currentFunction = [];
          inFunction = false;
        }
      }

      if (currentFunction.join('\n').length > this.chunkingStrategy.maxChunkSize * 2) {
        chunks.push(this.createChunk(
          document,
          currentFunction.join('\n'),
          'code',
          functionStart,
          i
        ));
        currentFunction = [];
        inFunction = false;
      }
    }

    if (currentFunction.length > 0) {
      chunks.push(this.createChunk(
        document,
        currentFunction.join('\n'),
        'code',
        functionStart,
        lines.length - 1
      ));
    }

    if (chunks.length === 0) {
      return this.chunkPlainText(document);
    }

    return chunks;
  }

  private isFunctionDeclaration(line: string, docType: DocumentType): boolean {
    const patterns: Partial<Record<DocumentType, RegExp[]>> = {
      [DocumentType.JAVASCRIPT]: [
        /^\s*function\s+\w+/,
        /^\s*(const|let|var)\s+\w+\s*=\s*(async\s+)?(\([^)]*\)|[^=]+)\s*=>/,
        /^\s*(export\s+)?(default\s+)?class\s+\w+/,
        /^\s*(async\s+)?function\s*\*/
      ],
      [DocumentType.TYPESCRIPT]: [
        /^\s*(export\s+)?(async\s+)?function\s+\w+/,
        /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?(\([^)]*\)|[^=]+)\s*=>/,
        /^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s+\w+/,
        /^\s*(export\s+)?interface\s+\w+/,
        /^\s*(export\s+)?type\s+\w+/
      ],
      [DocumentType.PYTHON]: [
        /^\s*def\s+\w+/,
        /^\s*async\s+def\s+\w+/,
        /^\s*class\s+\w+/
      ],
      [DocumentType.JAVA]: [
        /^\s*(public|private|protected)\s+(static\s+)?\w+\s+\w+\s*\(/,
        /^\s*(public|private|protected)?\s*class\s+\w+/
      ],
      [DocumentType.CSHARP]: [
        /^\s*(public|private|protected|internal)\s+(static\s+)?(async\s+)?\w+\s+\w+\s*\(/,
        /^\s*(public|private|protected|internal)?\s*(abstract\s+|sealed\s+)?class\s+\w+/
      ],
      [DocumentType.GO]: [
        /^\s*func\s+(\(\w+\s+\*?\w+\)\s+)?\w+/,
        /^\s*type\s+\w+\s+(struct|interface)/
      ],
      [DocumentType.RUST]: [
        /^\s*(pub\s+)?fn\s+\w+/,
        /^\s*(pub\s+)?struct\s+\w+/,
        /^\s*(pub\s+)?enum\s+\w+/,
        /^\s*impl\s+/
      ]
    };

    const docPatterns = patterns[docType] || [];
    return docPatterns.some(pattern => pattern.test(line));
  }

  private chunkStructured(document: Document): DocumentChunk[] {
    try {
      const parsed = document.type === DocumentType.JSON 
        ? JSON.parse(document.content)
        : yaml.parse(document.content);

      const chunks: DocumentChunk[] = [];
      this.chunkObject(parsed, document, chunks, []);
      return chunks;
    } catch (error) {
      logger.warn('Failed to parse structured document, falling back to plain text', { 
        filepath: document.filepath,
        error 
      });
      return this.chunkPlainText(document);
    }
  }

  private chunkObject(
    obj: any,
    document: Document,
    chunks: DocumentChunk[],
    path: string[]
  ): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    const currentPath = path.join('.');
    const content = document.type === DocumentType.JSON
      ? JSON.stringify(obj, null, 2)
      : yaml.stringify(obj);

    if (content.length <= this.chunkingStrategy.maxChunkSize) {
      chunks.push(this.createChunk(
        document,
        content,
        'other',
        0,
        0,
        { path: currentPath }
      ));
    } else {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          this.chunkObject(value, document, chunks, [...path, key]);
        }
      }
    }
  }

  private chunkPlainText(document: Document): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    // If content is too large, split by character blocks if no natural word breaks exist
    if (document.content.length > this.chunkingStrategy.maxChunkSize) {
      const hasSpaces = /\s/.test(document.content);
      
      if (!hasSpaces) {
        // Split long strings without spaces into character blocks
        let startIndex = 0;
        while (startIndex < document.content.length) {
          const chunkSize = Math.min(
            this.chunkingStrategy.maxChunkSize,
            document.content.length - startIndex
          );
          const chunkContent = document.content.substring(startIndex, startIndex + chunkSize);
          
          chunks.push(this.createChunk(
            document,
            chunkContent,
            'paragraph'
          ));
          
          startIndex += chunkSize - this.chunkingStrategy.overlapSize;
        }
        return chunks;
      }
    }
    
    const words = document.content.split(/\s+/);
    let currentChunk: string[] = [];

    for (const word of words) {
      // Check if adding this word would exceed chunk size
      const testChunk = [...currentChunk, word];
      if (testChunk.join(' ').length > this.chunkingStrategy.maxChunkSize && currentChunk.length > 0) {
        chunks.push(this.createChunk(
          document,
          currentChunk.join(' '),
          'paragraph'
        ));

        if (this.chunkingStrategy.overlapSize > 0) {
          const overlapWords = Math.floor(this.chunkingStrategy.overlapSize / 10);
          currentChunk = currentChunk.slice(-overlapWords);
          currentChunk.push(word);
        } else {
          currentChunk = [word];
        }
      } else {
        currentChunk.push(word);
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(
        document,
        currentChunk.join(' '),
        'paragraph'
      ));
    }

    return chunks;
  }

  private createChunk(
    document: Document,
    content: string,
    type: DocumentChunk['type'],
    startLine?: number,
    endLine?: number,
    additionalMetadata?: any
  ): DocumentChunk {
    const chunkId = this.generateChunkId(document.id, startLine || 0);
    
    return {
      id: chunkId,
      documentId: document.id,
      repository: document.repository,
      filepath: document.filepath,
      content,
      type,
      metadata: {
        ...document.metadata,
        ...additionalMetadata,
        repository: document.repository,
        filepath: document.filepath
      },
      startLine,
      endLine,
      hash: this.generateHash(content)
    };
  }

  private enhanceChunksWithContext(chunks: DocumentChunk[], document: Document): DocumentChunk[] {
    // Add document-level context to metadata
    for (const chunk of chunks) {
      chunk.metadata = {
        ...chunk.metadata,
        documentTitle: document.metadata.title,
        documentDescription: document.metadata.description
      };
    }
    return chunks;
  }

  private establishChunkRelationships(chunks: DocumentChunk[]): DocumentChunk[] {
    let lastHeadingChunk: DocumentChunk | null = null;
    const headingStack: DocumentChunk[] = [];

    for (const chunk of chunks) {
      if (chunk.type === 'heading') {
        const level = this.getHeadingLevel(chunk.content);
        
        while (headingStack.length > 0 && 
               this.getHeadingLevel(headingStack[headingStack.length - 1].content) >= level) {
          headingStack.pop();
        }

        if (headingStack.length > 0) {
          chunk.parentChunkId = headingStack[headingStack.length - 1].id;
          const parent = chunks.find(c => c.id === chunk.parentChunkId);
          if (parent) {
            parent.childChunkIds = parent.childChunkIds || [];
            parent.childChunkIds.push(chunk.id);
          }
        }

        headingStack.push(chunk);
        lastHeadingChunk = chunk;
      } else if (lastHeadingChunk) {
        chunk.parentChunkId = lastHeadingChunk.id;
      }
    }

    return chunks;
  }

  private getHeadingLevel(content: string): number {
    const match = content.match(/^(#{1,6})\s+/);
    return match ? match[1].length : 0;
  }

  private generateDocumentId(repository: string, filepath: string): string {
    return crypto
      .createHash('sha256')
      .update(`${repository}:${filepath}`)
      .digest('hex')
      .substring(0, 16);
  }

  private generateChunkId(documentId: string, index: number): string {
    return `${documentId}_${index.toString().padStart(4, '0')}`;
  }

  private generateHash(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16);
  }
}

export default DocumentProcessor;