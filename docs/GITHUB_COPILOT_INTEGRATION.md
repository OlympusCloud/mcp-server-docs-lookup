# GitHub Copilot Integration Guide

This guide explains how to integrate the Universal Documentation MCP Server with GitHub Copilot to enhance code suggestions with relevant documentation context.

## Overview

While GitHub Copilot doesn't natively support the Model Context Protocol (MCP), you can integrate documentation search through several approaches:

1. **API Server Mode** - Run the MCP server in API mode and create VS Code extensions
2. **VS Code Extension** - Custom extension that queries documentation and provides context
3. **Preprocessing Scripts** - Scripts that fetch documentation before Copilot suggestions
4. **Comments-Based Context** - Add documentation context as comments for Copilot to reference

## Setup Methods

### Method 1: API Server Integration (Recommended)

This approach runs the MCP server in API mode and integrates with VS Code.

#### Step 1: Start the API Server

```bash
# Navigate to your MCP server directory
cd /path/to/mcp-server-docs-lookup

# Ensure Qdrant is running
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant

# Start the API server
node dist/cli.js start --mode api --port 3001

# Verify the server is running
curl http://localhost:3001/api/health
```

#### Step 2: Create VS Code Extension

Create a simple VS Code extension that queries the documentation API:

```bash
# Create extension directory
mkdir copilot-docs-extension
cd copilot-docs-extension

# Initialize package.json
npm init -y

# Create extension structure
mkdir src
```

**package.json:**
```json
{
  "name": "copilot-docs-integration",
  "version": "1.0.0",
  "description": "Documentation integration for GitHub Copilot",
  "main": "./out/extension.js",
  "engines": {
    "vscode": "^1.74.0"
  },
  "activationEvents": [
    "onStartupFinished"
  ],
  "contributes": {
    "commands": [
      {
        "command": "copilotDocs.searchDocs",
        "title": "Search Documentation"
      },
      {
        "command": "copilotDocs.getContext",
        "title": "Get Documentation Context"
      }
    ],
    "keybindings": [
      {
        "command": "copilotDocs.searchDocs",
        "key": "ctrl+shift+d",
        "mac": "cmd+shift+d"
      }
    ]
  },
  "devDependencies": {
    "@types/vscode": "^1.74.0",
    "typescript": "^4.9.0"
  },
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

**src/extension.ts:**
```typescript
import * as vscode from 'vscode';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

interface DocumentationResult {
  content: string;
  source: string;
  score: number;
}

export function activate(context: vscode.ExtensionContext) {
  
  // Command to search documentation
  const searchDocsCommand = vscode.commands.registerCommand(
    'copilotDocs.searchDocs',
    async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Enter search query for documentation'
      });
      
      if (!query) return;
      
      try {
        const response = await axios.post(`${API_BASE_URL}/search`, {
          query,
          maxResults: 5
        });
        
        const results: DocumentationResult[] = response.data.results;
        
        // Display results in a new document
        const doc = await vscode.workspace.openTextDocument({
          content: formatDocumentationResults(results),
          language: 'markdown'
        });
        
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(`Documentation search failed: ${error}`);
      }
    }
  );
  
  // Command to get context for current selection
  const getContextCommand = vscode.commands.registerCommand(
    'copilotDocs.getContext',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      
      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);
      const language = editor.document.languageId;
      
      if (!selectedText) {
        vscode.window.showInformationMessage('Please select some code first');
        return;
      }
      
      try {
        const response = await axios.post(`${API_BASE_URL}/context`, {
          task: `Explain this ${language} code: ${selectedText}`,
          language,
          maxResults: 3
        });
        
        const results: DocumentationResult[] = response.data.results;
        
        // Insert documentation as comments above the selection
        const documentation = formatAsComments(results, language);
        
        await editor.edit(editBuilder => {
          editBuilder.insert(selection.start, documentation + '\\n');
        });
        
      } catch (error) {
        vscode.window.showErrorMessage(`Context retrieval failed: ${error}`);
      }
    }
  );
  
  // Auto-trigger context for Copilot
  const documentChangeListener = vscode.workspace.onDidChangeTextDocument(
    async (event) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || event.document !== editor.document) return;
      
      // Trigger on specific patterns (e.g., function definitions)
      const changes = event.contentChanges;
      for (const change of changes) {
        if (shouldTriggerContext(change.text, editor.document.languageId)) {
          await suggestDocumentationContext(editor, change.range);
        }
      }
    }
  );
  
  context.subscriptions.push(
    searchDocsCommand,
    getContextCommand,
    documentChangeListener
  );
}

function formatDocumentationResults(results: DocumentationResult[]): string {
  let formatted = '# Documentation Search Results\\n\\n';
  
  results.forEach((result, index) => {
    formatted += `## Result ${index + 1} (Score: ${result.score.toFixed(2)})\\n`;
    formatted += `**Source:** ${result.source}\\n\\n`;
    formatted += `${result.content}\\n\\n---\\n\\n`;
  });
  
  return formatted;
}

function formatAsComments(results: DocumentationResult[], language: string): string {
  const commentStyle = getCommentStyle(language);
  let formatted = '';
  
  results.forEach((result, index) => {
    if (index === 0) {
      formatted += `${commentStyle.start} Documentation Context:\\n`;
    }
    formatted += `${commentStyle.line} ${result.content.substring(0, 100)}...\\n`;
    formatted += `${commentStyle.line} Source: ${result.source}\\n`;
    if (index < results.length - 1) {
      formatted += `${commentStyle.line}\\n`;
    }
  });
  
  if (commentStyle.end) {
    formatted += `${commentStyle.end}\\n`;
  }
  
  return formatted;
}

function getCommentStyle(language: string): { start: string; line: string; end?: string } {
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'java':
    case 'csharp':
      return { start: '/**', line: ' *', end: ' */' };
    case 'python':
      return { start: '"""', line: '', end: '"""' };
    case 'html':
    case 'xml':
      return { start: '<!--', line: '', end: '-->' };
    default:
      return { start: '/*', line: ' *', end: ' */' };
  }
}

function shouldTriggerContext(text: string, language: string): boolean {
  // Trigger patterns for different languages
  const patterns = {
    javascript: [/function\\s+\\w+/, /class\\s+\\w+/, /const\\s+\\w+\\s*=/],
    typescript: [/function\\s+\\w+/, /class\\s+\\w+/, /interface\\s+\\w+/],
    python: [/def\\s+\\w+/, /class\\s+\\w+/],
    java: [/public\\s+class/, /public\\s+interface/, /public\\s+\\w+\\s+\\w+/],
  };
  
  const langPatterns = patterns[language as keyof typeof patterns] || [];
  return langPatterns.some(pattern => pattern.test(text));
}

async function suggestDocumentationContext(
  editor: vscode.TextEditor,
  range: vscode.Range
): Promise<void> {
  const line = editor.document.lineAt(range.start.line);
  const text = line.text;
  const language = editor.document.languageId;
  
  try {
    const response = await axios.post(`${API_BASE_URL}/context`, {
      task: `Provide context for this ${language} code pattern: ${text}`,
      language,
      maxResults: 2
    });
    
    const results: DocumentationResult[] = response.data.results;
    
    if (results.length > 0) {
      // Show as hover or insert as comment
      const documentation = formatAsComments(results, language);
      
      // Optional: Show as hover instead of inserting
      // vscode.languages.registerHoverProvider(language, {
      //   provideHover: () => new vscode.Hover(documentation)
      // });
    }
  } catch (error) {
    // Silently fail for auto-suggestions
    console.log('Auto-context failed:', error);
  }
}

export function deactivate() {}
```

#### Step 3: Build and Install Extension

```bash
# Compile TypeScript
npx tsc src/extension.ts --outDir out --target es2020 --module commonjs

# Package extension (optional)
npx vsce package

# Install in VS Code
# Method 1: Copy to extensions folder
# Method 2: Use "Developer: Install Extension from Location" in VS Code
```

### Method 2: Pre-commit Hook Integration

Create Git hooks that add documentation context before commits:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Get changed files
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=AM)

for FILE in $CHANGED_FILES; do
  if [[ $FILE =~ \\.(js|ts|py|java)$ ]]; then
    # Extract function/class names
    SYMBOLS=$(grep -E "(function|class|def)" "$FILE" | head -5)
    
    if [ ! -z "$SYMBOLS" ]; then
      # Query documentation API
      CONTEXT=$(curl -s -X POST http://localhost:3001/api/context \\
        -H "Content-Type: application/json" \\
        -d "{\"task\": \"Provide context for: $SYMBOLS\", \"maxResults\": 3}")
      
      # Add as comments at top of file
      if [ ! -z "$CONTEXT" ]; then
        # Process and add documentation comments
        echo "Adding documentation context to $FILE"
      fi
    fi
  fi
done
```

### Method 3: Copilot Comment Integration

Use strategic comments to provide documentation context that Copilot can reference:

#### JavaScript/TypeScript Example:

```javascript
// Documentation: React useEffect hook runs side effects in functional components
// Source: React docs - Effects are performed after every completed render
// Usage: useEffect(() => { /* effect */ }, [dependencies])

function MyComponent() {
  // Based on React documentation patterns:
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    // Effect implementation
  }, [count]);
}
```

#### Python Example:

```python
"""
Documentation: FastAPI dependency injection system
Source: FastAPI docs - Dependencies can be used to handle authentication, database connections
Pattern: Use Depends() for injecting reusable logic
"""

from fastapi import Depends, FastAPI

# Following FastAPI documentation patterns:
async def get_database():
    # Implementation based on FastAPI dependency docs
    pass

@app.get("/items/")
async def read_items(db=Depends(get_database)):
    # Copilot will suggest based on FastAPI patterns
    pass
```

## Advanced Integration

### Custom VS Code Tasks

Create VS Code tasks that automatically fetch documentation:

**/.vscode/tasks.json:**
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Fetch Documentation Context",
      "type": "shell",
      "command": "curl",
      "args": [
        "-X", "POST",
        "http://localhost:3001/api/context",
        "-H", "Content-Type: application/json",
        "-d", "{\"task\": \"${input:taskDescription}\", \"language\": \"${fileExtname}\"}"
      ],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    }
  ],
  "inputs": [
    {
      "id": "taskDescription",
      "type": "promptString",
      "description": "Describe what you're trying to implement"
    }
  ]
}
```

### Snippet Integration

Create VS Code snippets that include documentation queries:

**/.vscode/snippets.json:**
```json
{
  "React Component with Docs": {
    "prefix": "reactcomp",
    "body": [
      "// Documentation: ${1:Component description}",
      "// Pattern: Functional component with hooks",
      "// Source: React documentation",
      "",
      "import React, { useState, useEffect } from 'react';",
      "",
      "interface ${2:ComponentName}Props {",
      "  ${3:prop}: ${4:type};",
      "}",
      "",
      "export const ${2:ComponentName}: React.FC<${2:ComponentName}Props> = ({ ${3:prop} }) => {",
      "  ${0}",
      "",
      "  return (",
      "    <div>",
      "      {/* Component implementation */}",
      "    </div>",
      "  );",
      "};"
    ],
    "description": "React functional component with documentation context"
  }
}
```

## GitHub Copilot Chat Integration

If using GitHub Copilot Chat, you can create custom slash commands:

### Custom Chat Responses

Create responses that include documentation context:

```javascript
// In VS Code settings.json
{
  "github.copilot.advanced": {
    "debug.overrideProxyUrl": "http://localhost:3001/copilot-proxy"
  }
}
```

### Proxy Server for Chat Enhancement

Create a proxy that enhances Copilot requests with documentation:

```javascript
// copilot-proxy.js
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/copilot-proxy/*', async (req, res) => {
  const originalRequest = req.body;
  
  // Extract context from the request
  const context = originalRequest.messages?.slice(-1)[0]?.content;
  
  if (context) {
    try {
      // Get documentation context
      const docsResponse = await axios.post('http://localhost:3001/api/context', {
        task: context,
        maxResults: 3
      });
      
      // Enhance the request with documentation
      if (docsResponse.data.results.length > 0) {
        const docsContext = docsResponse.data.results
          .map(r => `Documentation: ${r.content}`)
          .join('\\n');
        
        originalRequest.messages[originalRequest.messages.length - 1].content = 
          `${context}\\n\\nRelevant documentation:\\n${docsContext}`;
      }
    } catch (error) {
      console.log('Documentation enhancement failed:', error);
    }
  }
  
  // Forward to actual Copilot API
  const copilotResponse = await axios.post(
    'https://copilot-proxy.githubusercontent.com' + req.path,
    originalRequest,
    { headers: req.headers }
  );
  
  res.json(copilotResponse.data);
});

app.listen(3002, () => {
  console.log('Copilot proxy running on port 3002');
});
```

## Best Practices

### 1. Strategic Comment Placement

Place documentation context strategically where Copilot can reference it:

```javascript
// Following React Hook patterns from official documentation
// useCallback memoizes functions to prevent unnecessary re-renders
// Dependencies array determines when to recreate the function

const handleClick = useCallback(() => {
  // Copilot will suggest based on the documentation context above
}, [dependency]);
```

### 2. Function Documentation Templates

Create templates that Copilot can learn from:

```typescript
/**
 * Documentation pattern: TypeScript generic function
 * Source: TypeScript handbook - Generic functions
 * Usage: Function that works with multiple types while maintaining type safety
 */
function identity<T>(arg: T): T {
  // Copilot will suggest type-safe implementations
  return arg;
}
```

### 3. API Integration Patterns

Use documentation to guide API usage patterns:

```python
# FastAPI documentation pattern: Dependency injection with database
# Source: FastAPI docs - SQL (Relational) Databases
# Pattern: Use Depends() to inject database session

@app.get("/users/{user_id}")
async def read_user(
    user_id: int, 
    db: Session = Depends(get_db)  # Copilot learns this pattern
):
    # Implementation follows FastAPI + SQLAlchemy patterns
    pass
```

## Troubleshooting

### API Server Issues

```bash
# Check if API server is running
curl http://localhost:3001/api/health

# Check logs
tail -f logs/api-server.log

# Restart API server
node dist/cli.js start --mode api --port 3001
```

### VS Code Extension Issues

1. **Extension not loading:**
   - Check VS Code Developer Console for errors
   - Verify extension is properly installed
   - Restart VS Code

2. **API requests failing:**
   - Verify API server is running on correct port
   - Check network connectivity
   - Review axios error messages

### Performance Optimization

1. **Limit documentation queries:**
   ```typescript
   // Debounce documentation requests
   const debouncedGetContext = debounce(getDocumentationContext, 500);
   ```

2. **Cache common queries:**
   ```typescript
   const documentationCache = new Map<string, DocumentationResult[]>();
   ```

3. **Filter by file type:**
   ```typescript
   const supportedLanguages = ['javascript', 'typescript', 'python', 'java'];
   if (!supportedLanguages.includes(language)) return;
   ```

This integration approach enhances GitHub Copilot's suggestions by providing relevant documentation context, making the AI more accurate and helpful for your specific development needs.