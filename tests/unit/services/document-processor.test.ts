import { describe, it, expect, beforeEach } from '@jest/globals';
import { DocumentProcessor } from '../../../src/services/document-processor';
import { DocumentType } from '../../../src/types/document';
import { SecurityValidator } from '../../../src/utils/security';

describe('DocumentProcessor', () => {
  let processor: DocumentProcessor;

  beforeEach(() => {
    processor = new DocumentProcessor();
  });

  describe('processDocument', () => {
    it('should process markdown document', async () => {
      const content = `# Main Title

This is an introduction paragraph.

## Section 1

Content for section 1.

### Subsection 1.1

Detailed content here.

## Section 2

Another section with content.`;

      const result = await processor.processDocument(
        '/test/doc.md',
        content,
        {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
          branch: 'main',
        }
      );

      expect(result.document).toBeDefined();
      expect(result.document.metadata.title).toBe('Main Title');
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].metadata.section).toBe('Main Title');
    });

    it('should handle code blocks in markdown', async () => {
      const content = `# Code Example

Here's some code:

\`\`\`typescript
function hello(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

More text after code.`;

      const result = await processor.processDocument('/test/code.md', content, {
        name: 'test-repo',
        url: 'https://github.com/test/repo',
        branch: 'main',
      });

      expect(result.chunks.length).toBeGreaterThan(0);
      const codeChunk = result.chunks.find(chunk => 
        chunk.content.includes('function hello')
      );
      expect(codeChunk).toBeDefined();
    });

    it('should process RST documents', async () => {
      const content = `Main Title
===========

This is an introduction.

Section 1
---------

Content for section 1.

Subsection 1.1
~~~~~~~~~~~~~~

Detailed content here.`;

      const result = await processor.processDocument(
        '/test/doc.rst',
        content,
        {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
          branch: 'main',
        }
      );

      expect(result.document.metadata.title).toBe('Main Title');
      expect(result.chunks.length).toBeGreaterThan(0);
    });

    it('should extract front matter from markdown', async () => {
      const content = `---
title: Custom Title
tags: [doc, test]
author: Test Author
---

# Main Content

This is the main content.`;

      const result = await processor.processDocument('/test/frontmatter.md', content, {
        name: 'test-repo',
        url: 'https://github.com/test/repo',
        branch: 'main',
      });

      expect(result.document.metadata.title).toBe('Custom Title');
      expect(result.document.metadata.tags).toEqual(['doc', 'test']);
      expect(result.document.metadata.author).toBe('Test Author');
    });

    it('should handle empty documents', async () => {
      const result = await processor.processDocument('/test/empty.md', '', {
        name: 'test-repo',
        url: 'https://github.com/test/repo',
        branch: 'main',
      });

      expect(result.document).toBeDefined();
      expect(result.chunks).toHaveLength(0);
    });

    it('should respect chunk size limits', async () => {
      const longContent = 'A'.repeat(10000);
      const content = `# Title\n\n${longContent}`;

      const result = await processor.processDocument('/test/long.md', content, {
        name: 'test-repo',
        url: 'https://github.com/test/repo',
        branch: 'main',
      });

      expect(result.chunks.length).toBeGreaterThan(1);
      result.chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(2000);
      });
    });
  });

  describe('chunkOverlap', () => {
    it('should create overlapping chunks', async () => {
      const content = `# Title

Paragraph 1 content.

Paragraph 2 content.

Paragraph 3 content.

Paragraph 4 content.`;

      const result = await processor.processDocument('/test/overlap.md', content, {
        name: 'test-repo',
        url: 'https://github.com/test/repo',
        branch: 'main',
      });

      // Check that chunks have some overlap
      for (let i = 1; i < result.chunks.length; i++) {
        const prevChunk = result.chunks[i - 1];
        const currChunk = result.chunks[i];
        
        // There should be some content overlap
        const prevLines = prevChunk.content.split('\n');
        const currLines = currChunk.content.split('\n');
        
        const hasOverlap = prevLines.some(line => 
          line.trim() && currLines.includes(line)
        );
        
        if (prevChunk.metadata.section === currChunk.metadata.section) {
          expect(hasOverlap).toBe(true);
        }
      }
    });
  });

  describe('metadata extraction', () => {
    it('should extract complete metadata', async () => {
      const content = `# API Reference

## Authentication

### OAuth2

OAuth2 implementation details.`;

      const result = await processor.processDocument(
        '/docs/api/auth.md',
        content,
        {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
          branch: 'main',
          category: 'documentation',
          priority: 'high',
        }
      );

      const chunk = result.chunks.find(c => c.content.includes('OAuth2'));
      expect(chunk).toBeDefined();
      expect(chunk!.metadata).toMatchObject({
        repository: 'test-repo',
        branch: 'main',
        filepath: '/docs/api/auth.md',
        section: expect.any(String),
        category: 'documentation',
        priority: 'high',
      });
    });
  });

  describe('security', () => {
    it('should sanitize malicious content', async () => {
      const maliciousContent = `# Test
      
<script>alert('xss')</script>

Normal content here.

\`\`\`javascript
const token = 'sk-1234567890abcdef';
\`\`\``;

      const result = await processor.processDocument(
        '/test/malicious.md',
        maliciousContent,
        {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
          branch: 'main',
        }
      );

      // Content should be sanitized
      const contentStr = result.chunks.map(c => c.content).join(' ');
      expect(contentStr).not.toContain('<script>');
      expect(contentStr).not.toContain('sk-1234567890abcdef');
    });

    it('should validate file paths', async () => {
      await expect(processor.processDocument(
        '../../../etc/passwd',
        'content',
        {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
          branch: 'main',
        }
      )).rejects.toThrow();
    });

    it('should limit content size', async () => {
      const hugeContent = 'A'.repeat(2000000); // 2MB
      
      const result = await processor.processDocument(
        '/test/huge.md',
        hugeContent,
        {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
          branch: 'main',
        }
      );

      // Content should be truncated to 1MB
      expect(result.document.content.length).toBeLessThanOrEqual(1000000);
    });

    it('should sanitize metadata', async () => {
      const content = `---
title: Test Document
password: secret123
apiKey: sk-abcdef
email: user@example.com
---

# Content`;

      const result = await processor.processDocument(
        '/test/sensitive.md',
        content,
        {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
          branch: 'main',
        }
      );

      expect(result.document.metadata.title).toBe('Test Document');
      expect(result.document.metadata.password).toBeUndefined();
      expect(result.document.metadata.apiKey).toBeUndefined();
      expect(result.document.metadata.email).toBeUndefined();
    });
  });

  describe('performance', () => {
    it('should handle large documents efficiently', async () => {
      const largeContent = Array(1000).fill(`
## Section

This is a paragraph with some content that makes it reasonably sized.
It contains multiple sentences to simulate real documentation.

### Subsection

More content here with examples and explanations.
      `).join('\n');

      const startTime = Date.now();
      
      const result = await processor.processDocument(
        '/test/large.md',
        largeContent,
        {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
          branch: 'main',
        }
      );

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.chunks.length).toBeGreaterThan(0);
    });

    it('should create appropriately sized chunks', async () => {
      const content = `# Large Document

${Array(20).fill('This is a paragraph with substantial content that will help test the chunking algorithm. ').join('\n\n')}

## Section 2

${Array(20).fill('Another section with lots of content to ensure proper chunking behavior. ').join('\n\n')}`;

      const result = await processor.processDocument(
        '/test/chunking.md',
        content,
        {
          name: 'test-repo',
          url: 'https://github.com/test/repo',
          branch: 'main',
        }
      );

      // Verify chunk sizes are within expected range
      result.chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(2000);
        expect(chunk.content.length).toBeGreaterThan(0);
      });

      // Verify overlapping chunks maintain context
      for (let i = 1; i < result.chunks.length; i++) {
        const prevChunk = result.chunks[i - 1];
        const currChunk = result.chunks[i];
        
        if (prevChunk.metadata.headingContext === currChunk.metadata.headingContext) {
          // Should have some overlapping content or context
          expect(currChunk.metadata.headingContext).toBeDefined();
        }
      }
    });
  });

  describe('document type detection', () => {
    it('should detect markdown files correctly', async () => {
      const result = await processor.processDocument(
        '/test/doc.md',
        '# Test',
        { name: 'test', url: 'https://github.com/test/repo', branch: 'main' }
      );
      
      expect(result.document.type).toBe(DocumentType.MARKDOWN);
    });

    it('should detect TypeScript files correctly', async () => {
      const content = `
interface User {
  id: string;
  name: string;
}

function getUser(id: string): User {
  return { id, name: 'Test' };
}`;

      const result = await processor.processDocument(
        '/test/code.ts',
        content,
        { name: 'test', url: 'https://github.com/test/repo', branch: 'main' }
      );
      
      expect(result.document.type).toBe(DocumentType.TYPESCRIPT);
    });

    it('should detect JSON files correctly', async () => {
      const content = `{
  "name": "test-package",
  "version": "1.0.0",
  "description": "Test package"
}`;

      const result = await processor.processDocument(
        '/test/package.json',
        content,
        { name: 'test', url: 'https://github.com/test/repo', branch: 'main' }
      );
      
      expect(result.document.type).toBe(DocumentType.JSON);
    });
  });

  describe('error handling', () => {
    it('should handle malformed YAML frontmatter gracefully', async () => {
      const content = `---
title: Test
invalid: yaml: content: here
---

# Content`;

      const result = await processor.processDocument(
        '/test/bad-yaml.md',
        content,
        { name: 'test', url: 'https://github.com/test/repo', branch: 'main' }
      );

      // Should still process the document
      expect(result.document).toBeDefined();
      expect(result.chunks.length).toBeGreaterThan(0);
    });

    it('should handle binary content gracefully', async () => {
      const binaryContent = Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString();
      
      const result = await processor.processDocument(
        '/test/binary.png',
        binaryContent,
        { name: 'test', url: 'https://github.com/test/repo', branch: 'main' }
      );

      // Should create document but with sanitized content
      expect(result.document).toBeDefined();
    });
  });
});

describe('DocumentProcessor configuration', () => {
  it('should use custom chunking strategy', () => {
    const customProcessor = new DocumentProcessor({
      maxChunkSize: 500,
      overlapSize: 100,
      respectBoundaries: false,
      preserveContext: false
    });

    expect(customProcessor).toBeDefined();
  });

  it('should use default chunking strategy', () => {
    const defaultProcessor = new DocumentProcessor();
    expect(defaultProcessor).toBeDefined();
  });
});