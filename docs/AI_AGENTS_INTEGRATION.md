# AI Coding Agents Integration Guide

This guide covers integration of the Universal Documentation MCP Server with various AI coding assistants and agents beyond Claude and GitHub Copilot.

## Overview

The Universal Documentation MCP Server can enhance multiple AI coding agents through different integration methods:

- **MCP Protocol** - Direct integration for agents that support MCP
- **API Integration** - REST API for agents that support HTTP calls
- **Plugin/Extension** - Custom plugins for specific IDEs and editors
- **Context Injection** - Adding documentation context to prompts

## Cursor IDE Integration

Cursor IDE has emerging MCP support and can integrate through multiple methods.

### Method 1: MCP Integration (Recommended)

**Step 1: Configure Cursor Settings**

Create or update Cursor's MCP configuration:

```json
// ~/.cursor/mcp_servers.json
{
  "mcpServers": {
    "universal-docs": {
      "command": "node",
      "args": ["/path/to/mcp-server-docs-lookup/dist/server.js", "--stdio"],
      "cwd": "/path/to/mcp-server-docs-lookup",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Step 2: Restart Cursor**

The MCP server will be available as a tool within Cursor's AI assistant.

### Method 2: API Integration

**Step 1: Start API Server**

```bash
cd /path/to/mcp-server-docs-lookup
node dist/cli.js start --mode api --port 3001
```

**Step 2: Create Cursor Extension**

```typescript
// cursor-docs-extension/src/extension.ts
import { CursorAPI } from '@cursor/api';

export class DocsIntegration {
  private apiUrl = 'http://localhost:3001/api';
  
  async enhanceCompletion(context: string, language: string): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: context,
          language,
          maxResults: 3
        })
      });
      
      const docs = await response.json();
      return this.formatDocumentation(docs.results);
    } catch (error) {
      console.log('Documentation fetch failed:', error);
      return '';
    }
  }
  
  private formatDocumentation(results: any[]): string {
    return results.map(r => 
      `// Documentation: ${r.content.substring(0, 100)}...\\n// Source: ${r.source}`
    ).join('\\n');
  }
}

// Register with Cursor
CursorAPI.registerContextProvider('documentation', new DocsIntegration());
```

## Continue.dev Integration

Continue.dev supports custom context providers, making integration straightforward.

### Configuration

**Step 1: Update Continue Config**

```json
// ~/.continue/config.json
{
  "models": [
    {
      "title": "Documentation Enhanced GPT-4",
      "provider": "openai",
      "model": "gpt-4",
      "contextProviders": [
        {
          "name": "documentation",
          "params": {
            "serverUrl": "http://localhost:3001/api",
            "maxResults": 5
          }
        }
      ]
    }
  ],
  "contextProviders": [
    {
      "name": "documentation",
      "params": {
        "serverUrl": "http://localhost:3001/api/search",
        "contextUrl": "http://localhost:3001/api/context"
      }
    }
  ]
}
```

**Step 2: Custom Context Provider**

```typescript
// continue-docs-provider.ts
import { ContextProvider, ContextProviderDescription, ContextProviderExtras } from "core";

export class DocumentationContextProvider implements ContextProvider {
  static description: ContextProviderDescription = {
    title: "Documentation",
    displayTitle: "Documentation Search",
    description: "Search indexed documentation repositories",
    type: "query",
  };

  async getContextItems(
    query: string,
    extras: ContextProviderExtras
  ): Promise<ContextItem[]> {
    try {
      const response = await fetch('http://localhost:3001/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          maxResults: 5,
          language: extras.language
        })
      });

      const data = await response.json();
      
      return data.results.map((result: any) => ({
        name: result.source,
        description: `Documentation: ${result.content.substring(0, 100)}...`,
        content: result.content
      }));
    } catch (error) {
      console.error('Documentation search failed:', error);
      return [];
    }
  }
}
```

## Codeium Integration

Codeium can be enhanced through custom context and API integration.

### Method 1: Custom Context Provider

**Step 1: Create Codeium Plugin**

```python
# codeium_docs_plugin.py
import requests
import json
from typing import List, Dict

class CodeiumDocsIntegration:
    def __init__(self, api_url: str = "http://localhost:3001/api"):
        self.api_url = api_url
    
    def get_documentation_context(self, code_context: str, language: str) -> str:
        """Get documentation context for code completion"""
        try:
            response = requests.post(f"{self.api_url}/context", 
                json={
                    "task": f"Provide context for {language} code: {code_context}",
                    "language": language,
                    "maxResults": 3
                }
            )
            
            if response.status_code == 200:
                docs = response.json()
                return self.format_docs_for_codeium(docs['results'])
            
        except Exception as e:
            print(f"Documentation fetch failed: {e}")
        
        return ""
    
    def format_docs_for_codeium(self, results: List[Dict]) -> str:
        """Format documentation for Codeium context"""
        context = "// Documentation Context:\\n"
        for result in results:
            context += f"// {result['content'][:100]}...\\n"
            context += f"// Source: {result['source']}\\n"
        return context + "\\n"

# Usage in VS Code/Editor
docs_integration = CodeiumDocsIntegration()

def enhance_codeium_completion(code_context: str, language: str) -> str:
    docs_context = docs_integration.get_documentation_context(code_context, language)
    return docs_context + code_context
```

### Method 2: Preprocessor Script

```bash
#!/bin/bash
# codeium-docs-preprocessor.sh

# Get current file context
CURRENT_FILE="$1"
LANGUAGE="$2"
CURSOR_LINE="$3"

# Extract surrounding context
CONTEXT=$(sed -n "$((CURSOR_LINE-5)),$((CURSOR_LINE+5))p" "$CURRENT_FILE")

# Query documentation API
DOCS=$(curl -s -X POST http://localhost:3001/api/context \\
  -H "Content-Type: application/json" \\
  -d "{\"task\": \"$CONTEXT\", \"language\": \"$LANGUAGE\", \"maxResults\": 2}")

# Format as comments
echo "$DOCS" | jq -r '.results[] | "// " + .content[:100] + "..."'
```

## Tabnine Integration

Tabnine supports custom models and context providers.

### Custom Tabnine Plugin

```javascript
// tabnine-docs-plugin.js
const axios = require('axios');

class TabnineDocsPlugin {
  constructor() {
    this.apiUrl = 'http://localhost:3001/api';
    this.cache = new Map();
  }

  async getCompletionContext(prefix, suffix, language) {
    const cacheKey = `${language}:${prefix.slice(-100)}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await axios.post(`${this.apiUrl}/context`, {
        task: `Complete this ${language} code: ${prefix}`,
        language,
        maxResults: 2
      });

      const context = this.formatContext(response.data.results);
      this.cache.set(cacheKey, context);
      
      return context;
    } catch (error) {
      console.log('Documentation context failed:', error);
      return '';
    }
  }

  formatContext(results) {
    return results.map(r => 
      `/* Documentation: ${r.content.substring(0, 80)}... */`
    ).join('\\n');
  }

  // Tabnine plugin interface
  async onBeforeCompletion(request) {
    const context = await this.getCompletionContext(
      request.before,
      request.after,
      request.language
    );

    if (context) {
      request.before = context + '\\n' + request.before;
    }

    return request;
  }
}

module.exports = new TabnineDocsPlugin();
```

## JetBrains IDEs Integration

IntelliJ IDEA, PyCharm, WebStorm, etc. can integrate through custom plugins.

### Method 1: IntelliJ Plugin

```java
// DocumentationPlugin.java
package com.example.docsplugin;

import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.Messages;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;

public class SearchDocumentationAction extends AnAction {
    
    @Override
    public void actionPerformed(AnActionEvent e) {
        Project project = e.getProject();
        Editor editor = FileEditorManager.getInstance(project).getSelectedTextEditor();
        
        if (editor != null) {
            String selectedText = editor.getSelectionModel().getSelectedText();
            if (selectedText != null && !selectedText.isEmpty()) {
                searchDocumentation(selectedText, project);
            }
        }
    }
    
    private void searchDocumentation(String query, Project project) {
        try {
            HttpClient client = HttpClient.newHttpClient();
            
            String requestBody = String.format(
                "{\\"query\\": \\"%s\\", \\"maxResults\\": 5}",
                query.replace("\\"", "\\\\\\"")
            );
            
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:3001/api/search"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();
            
            HttpResponse<String> response = client.send(request, 
                HttpResponse.BodyHandlers.ofString());
            
            if (response.statusCode() == 200) {
                showDocumentationResults(response.body(), project);
            }
            
        } catch (IOException | InterruptedException ex) {
            Messages.showErrorDialog(project, 
                "Failed to fetch documentation: " + ex.getMessage(),
                "Documentation Error");
        }
    }
    
    private void showDocumentationResults(String jsonResponse, Project project) {
        // Parse JSON and show in tool window or popup
        Messages.showInfoMessage(project, jsonResponse, "Documentation Results");
    }
}
```

### Method 2: HTTP Client Integration

**Step 1: Create HTTP Client Requests**

```http
### Search Documentation
POST http://localhost:3001/api/search
Content-Type: application/json

{
  "query": "Spring Boot configuration",
  "language": "java",
  "maxResults": 10
}

### Get Context for Current Task
POST http://localhost:3001/api/context
Content-Type: application/json

{
  "task": "implement REST API with Spring Boot",
  "language": "java",
  "framework": "spring",
  "maxResults": 5
}
```

## Vim/Neovim Integration

For Vim and Neovim users, integration can be done through plugins.

### Neovim Lua Plugin

```lua
-- docs-integration.lua
local M = {}

local function fetch_documentation(query, language)
  local curl = require('plenary.curl')
  
  local response = curl.post('http://localhost:3001/api/search', {
    body = vim.fn.json_encode({
      query = query,
      language = language,
      maxResults = 5
    }),
    headers = {
      ['Content-Type'] = 'application/json'
    }
  })
  
  if response.status == 200 then
    local data = vim.fn.json_decode(response.body)
    return data.results
  end
  
  return {}
end

local function format_docs_as_comments(results, language)
  local comment_char = language == 'python' and '#' or '//'
  local lines = {}
  
  table.insert(lines, comment_char .. ' Documentation:')
  for _, result in ipairs(results) do
    local content = string.sub(result.content, 1, 80) .. '...'
    table.insert(lines, comment_char .. ' ' .. content)
    table.insert(lines, comment_char .. ' Source: ' .. result.source)
  end
  
  return lines
end

function M.search_docs()
  local query = vim.fn.input('Search documentation: ')
  if query == '' then return end
  
  local language = vim.bo.filetype
  local results = fetch_documentation(query, language)
  
  if #results > 0 then
    -- Show in floating window
    local lines = {}
    for _, result in ipairs(results) do
      table.insert(lines, 'Source: ' .. result.source)
      table.insert(lines, result.content)
      table.insert(lines, string.rep('-', 40))
    end
    
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
    
    local width = math.floor(vim.o.columns * 0.8)
    local height = math.floor(vim.o.lines * 0.8)
    
    vim.api.nvim_open_win(buf, true, {
      relative = 'editor',
      width = width,
      height = height,
      col = math.floor((vim.o.columns - width) / 2),
      row = math.floor((vim.o.lines - height) / 2),
      border = 'rounded'
    })
  end
end

function M.insert_docs_context()
  local line = vim.api.nvim_get_current_line()
  local language = vim.bo.filetype
  
  local results = fetch_documentation(line, language)
  if #results > 0 then
    local docs_lines = format_docs_as_comments(results, language)
    local row = vim.api.nvim_win_get_cursor(0)[1]
    
    vim.api.nvim_buf_set_lines(0, row - 1, row - 1, false, docs_lines)
  end
end

-- Key mappings
vim.keymap.set('n', '<leader>ds', M.search_docs, { desc = 'Search documentation' })
vim.keymap.set('n', '<leader>dc', M.insert_docs_context, { desc = 'Insert docs context' })

return M
```

## Emacs Integration

For Emacs users, create an integration package.

### Emacs Lisp Package

```elisp
;;; docs-integration.el --- Documentation integration for AI coding

(require 'json)
(require 'url)

(defvar docs-api-url "http://localhost:3001/api"
  "Base URL for the documentation API.")

(defun docs-search (query)
  "Search documentation for QUERY."
  (interactive "sSearch documentation: ")
  (let ((url-request-method "POST")
        (url-request-extra-headers '(("Content-Type" . "application/json")))
        (url-request-data (json-encode `((query . ,query)
                                       (maxResults . 5)))))
    (with-current-buffer (url-retrieve-synchronously 
                         (concat docs-api-url "/search"))
      (goto-char (point-min))
      (re-search-forward "^$" nil 'move)
      (forward-char)
      (let ((response (json-read)))
        (docs-display-results (cdr (assoc 'results response)))))))

(defun docs-display-results (results)
  "Display documentation RESULTS in a buffer."
  (with-output-to-temp-buffer "*Documentation*"
    (dolist (result results)
      (let ((source (cdr (assoc 'source result)))
            (content (cdr (assoc 'content result))))
        (princ (format "Source: %s\\n" source))
        (princ (format "%s\\n" content))
        (princ (make-string 40 ?-))
        (princ "\\n\\n")))))

(defun docs-insert-context ()
  "Insert documentation context as comments."
  (interactive)
  (let* ((line (thing-at-point 'line t))
         (language (file-name-extension (buffer-file-name)))
         (comment-char (cond ((string= language "py") "# ")
                           (t "// "))))
    (docs-get-context-async line language
                           (lambda (results)
                             (save-excursion
                               (beginning-of-line)
                               (dolist (result results)
                                 (let ((content (substring (cdr (assoc 'content result)) 0 80)))
                                   (insert comment-char "Documentation: " content "...\\n"))))))))

;; Key bindings
(global-set-key (kbd "C-c d s") 'docs-search)
(global-set-key (kbd "C-c d c") 'docs-insert-context)

(provide 'docs-integration)
;;; docs-integration.el ends here
```

## API Integration Examples

For any AI agent that supports HTTP requests:

### cURL Examples

```bash
# Search documentation
curl -X POST http://localhost:3001/api/search \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "implement authentication",
    "language": "typescript",
    "maxResults": 5
  }'

# Get context for coding task
curl -X POST http://localhost:3001/api/context \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "build REST API with Express",
    "language": "javascript",
    "framework": "express",
    "maxResults": 3
  }'

# List repositories
curl -X GET http://localhost:3001/api/repos

# Health check
curl -X GET http://localhost:3001/api/health
```

### Python Integration

```python
import requests
import json

class DocsIntegration:
    def __init__(self, api_url="http://localhost:3001/api"):
        self.api_url = api_url
    
    def search_docs(self, query, language=None, max_results=5):
        """Search documentation"""
        payload = {
            "query": query,
            "maxResults": max_results
        }
        if language:
            payload["language"] = language
            
        response = requests.post(f"{self.api_url}/search", json=payload)
        return response.json() if response.status_code == 200 else None
    
    def get_context(self, task, language=None, framework=None, max_results=3):
        """Get documentation context for a task"""
        payload = {
            "task": task,
            "maxResults": max_results
        }
        if language:
            payload["language"] = language
        if framework:
            payload["framework"] = framework
            
        response = requests.post(f"{self.api_url}/context", json=payload)
        return response.json() if response.status_code == 200 else None

# Usage example
docs = DocsIntegration()
results = docs.search_docs("React hooks", "javascript")
print(json.dumps(results, indent=2))
```

## Troubleshooting

### Common Issues

1. **API Server Not Running**
   ```bash
   # Check if server is running
   curl http://localhost:3001/api/health
   
   # Start server if needed
   cd /path/to/mcp-server-docs-lookup
   node dist/cli.js start --mode api --port 3001
   ```

2. **CORS Issues**
   ```javascript
   // Add CORS headers to API server
   app.use((req, res, next) => {
     res.header('Access-Control-Allow-Origin', '*');
     res.header('Access-Control-Allow-Headers', 'Content-Type');
     next();
   });
   ```

3. **Performance Issues**
   - Limit `maxResults` to 3-5 for faster responses
   - Cache common queries
   - Use debouncing for real-time integrations

### Best Practices

1. **Context Management**
   - Keep documentation context concise (< 200 chars per result)
   - Focus on relevant examples and patterns
   - Include source information for credibility

2. **Error Handling**
   - Always handle API failures gracefully
   - Provide fallback behavior when documentation isn't available
   - Log errors for debugging

3. **Performance**
   - Cache frequent queries
   - Use background requests when possible
   - Limit concurrent API calls

This comprehensive integration guide enables any AI coding agent to benefit from enhanced documentation context, improving code suggestions and development workflows.