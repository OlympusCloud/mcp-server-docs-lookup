import * as fs from 'fs';
import * as path from 'path';

export interface SearchResult {
  file: string;
  line: number;
  content: string;
  context: string;
  repository: string;
}

export class SimpleSearch {
  private reposDir: string;

  constructor(reposDir: string = 'data/repositories') {
    this.reposDir = reposDir;
  }

  searchDocuments(query: string, maxResults: number = 10): SearchResult[] {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    // Search in Olympus docs first (highest priority)
    const olympusPath = path.join(this.reposDir, 'olympus-docs');
    if (fs.existsSync(olympusPath)) {
      this.searchInRepository(olympusPath, 'olympus-docs', queryLower, results);
    }

    // Search in other repositories if needed
    if (results.length < maxResults) {
      const repoDirs = fs.readdirSync(this.reposDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name !== 'olympus-docs')
        .map(entry => entry.name);

      for (const repoName of repoDirs) {
        if (results.length >= maxResults) break;
        const repoPath = path.join(this.reposDir, repoName);
        this.searchInRepository(repoPath, repoName, queryLower, results);
      }
    }

    return results.slice(0, maxResults);
  }

  private searchInRepository(repoPath: string, repoName: string, query: string, results: SearchResult[]): void {
    this.walkDirectory(repoPath, repoPath, repoName, query, results);
  }

  private walkDirectory(dir: string, baseDir: string, repoName: string, query: string, results: SearchResult[]): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          this.walkDirectory(fullPath, baseDir, repoName, query, results);
        } else if (entry.isFile() && this.isTextFile(entry.name)) {
          this.searchInFile(fullPath, relativePath, repoName, query, results);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  private isTextFile(filename: string): boolean {
    const extensions = ['.md', '.txt', '.json', '.yml', '.yaml', '.rst', '.adoc'];
    return extensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  private searchInFile(filePath: string, relativePath: string, repoName: string, query: string, results: SearchResult[]): void {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, lineNum) => {
        if (line.toLowerCase().includes(query)) {
          const contextStart = Math.max(0, lineNum - 2);
          const contextEnd = Math.min(lines.length, lineNum + 3);
          const context = lines.slice(contextStart, contextEnd).join('\n');
          
          results.push({
            file: relativePath,
            line: lineNum + 1,
            content: line.trim(),
            context,
            repository: repoName
          });
        }
      });
    } catch (error) {
      // Skip files that can't be read
    }
  }
}