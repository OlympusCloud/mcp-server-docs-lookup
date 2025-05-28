# API Usage Examples

This guide provides examples of using the Universal Documentation MCP Server REST API.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Currently, the API doesn't require authentication. In production, you should implement appropriate authentication.

## Endpoints

### 1. Context Generation

#### Generate Context for a Task

```bash
curl -X POST http://localhost:3000/api/context/generate \
  -H "Content-Type: application/json" \
  -d '{
    "task": "implement user authentication with JWT",
    "language": "typescript",
    "framework": "express",
    "maxResults": 10
  }'
```

Response:
```json
{
  "query": {
    "task": "implement user authentication with JWT",
    "language": "typescript",
    "framework": "express",
    "maxResults": 10
  },
  "strategy": "hybrid",
  "results": [
    {
      "content": "## JWT Authentication in Express\n\nTo implement JWT authentication...",
      "repository": "express-docs",
      "filepath": "/guides/authentication.md",
      "score": 0.92,
      "metadata": {
        "title": "Authentication Guide",
        "category": "security"
      }
    }
  ],
  "metadata": {
    "totalResults": 10,
    "searchTime": 245,
    "repositories": ["express-docs", "jwt-docs"],
    "categories": ["security", "authentication"]
  }
}
```

#### Generate Formatted Context

```bash
curl -X POST http://localhost:3000/api/context/generate-formatted \
  -H "Content-Type: application/json" \
  -d '{
    "task": "create REST API with validation",
    "framework": "fastapi"
  }'
```

Response (plain text):
```markdown
# Context for: create REST API with validation

## Sources: fastapi-docs, pydantic-docs

## Repository: fastapi-docs

### /docs/tutorial/request-validation.md
**Request Validation**

FastAPI uses Pydantic models for request validation...

*Relevance: High semantic similarity; Matches framework: fastapi*
```

### 2. Repository Management

#### Get Repository Status

```bash
curl http://localhost:3000/api/repos/status
```

Response:
```json
{
  "repositories": [
    {
      "name": "react-docs",
      "url": "https://github.com/reactjs/react.dev.git",
      "branch": "main",
      "priority": "high",
      "category": "framework",
      "syncInterval": 60
    }
  ],
  "stats": {
    "totalDocuments": 156,
    "totalChunks": 3420,
    "collectionSize": 3420
  }
}
```

#### Add a Repository

```bash
curl -X POST http://localhost:3000/api/repos/add \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vue-docs",
    "url": "https://github.com/vuejs/docs.git",
    "branch": "main",
    "priority": "high",
    "category": "framework",
    "paths": ["/src/guide", "/src/api"],
    "syncInterval": 120
  }'
```

#### Sync Repositories

```bash
# Sync all repositories
curl -X POST http://localhost:3000/api/repos/sync

# Sync specific repository
curl -X POST http://localhost:3000/api/repos/sync \
  -H "Content-Type: application/json" \
  -d '{"repository": "react-docs"}'
```

#### Update Repository

```bash
curl -X PUT http://localhost:3000/api/repos/react-docs \
  -H "Content-Type: application/json" \
  -d '{
    "priority": "medium",
    "syncInterval": 180
  }'
```

#### Delete Repository

```bash
curl -X DELETE http://localhost:3000/api/repos/vue-docs
```

### 3. Search

#### Basic Search

```bash
curl "http://localhost:3000/api/search?q=useEffect%20cleanup"
```

Response:
```json
{
  "query": "useEffect cleanup",
  "results": [
    {
      "content": "## Cleanup in useEffect\n\nTo cleanup side effects...",
      "repository": "react-docs",
      "filepath": "/hooks/useEffect.md",
      "type": "heading",
      "score": 0.89,
      "metadata": {
        "title": "useEffect Hook",
        "category": "hooks"
      }
    }
  ],
  "total": 15
}
```

#### Search with Filters

```bash
curl "http://localhost:3000/api/search?q=authentication&category=security&repository=express-docs&limit=5"
```

#### Metadata Search

```bash
curl "http://localhost:3000/api/search/metadata?repository=react-docs&type=code&limit=20"
```

#### Get Search Statistics

```bash
curl http://localhost:3000/api/search/stats
```

### 4. Configuration

#### Get Current Configuration

```bash
curl http://localhost:3000/api/config
```

#### List Available Presets

```bash
curl http://localhost:3000/api/presets
```

Response:
```json
{
  "presets": [
    "general-web",
    "dotnet-azure",
    "owasp-security",
    "ai-ml",
    "data-engineering",
    "olympus-cloud"
  ]
}
```

#### Apply a Preset

```bash
curl -X POST http://localhost:3000/api/presets/ai-ml/apply
```

## JavaScript/TypeScript Client Examples

### Using Fetch API

```typescript
class DocsMCPClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000/api') {
    this.baseUrl = baseUrl;
  }

  async searchDocumentation(
    task: string,
    options?: {
      language?: string;
      framework?: string;
      maxResults?: number;
    }
  ) {
    const response = await fetch(`${this.baseUrl}/context/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, ...options })
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getRepositoryStatus() {
    const response = await fetch(`${this.baseUrl}/repos/status`);
    return response.json();
  }

  async syncRepository(repository?: string) {
    const response = await fetch(`${this.baseUrl}/repos/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repository })
    });
    return response.json();
  }
}

// Usage
const client = new DocsMCPClient();

// Search for documentation
const results = await client.searchDocumentation(
  'implement websocket server',
  { framework: 'nodejs' }
);

console.log(`Found ${results.metadata.totalResults} results`);
results.results.forEach(result => {
  console.log(`- ${result.repository}: ${result.filepath} (score: ${result.score})`);
});
```

### Using Axios

```javascript
const axios = require('axios');

class DocsAPI {
  constructor(baseURL = 'http://localhost:3000/api') {
    this.client = axios.create({ baseURL });
  }

  async search(query, filters = {}) {
    const params = new URLSearchParams({ q: query, ...filters });
    const { data } = await this.client.get(`/search?${params}`);
    return data;
  }

  async addRepository(repository) {
    const { data } = await this.client.post('/repos/add', repository);
    return data;
  }

  async generateContext(task, options = {}) {
    const { data } = await this.client.post('/context/generate', {
      task,
      ...options
    });
    return data;
  }
}

// Usage
const api = new DocsAPI();

// Add a new repository
await api.addRepository({
  name: 'my-docs',
  url: 'https://github.com/myorg/docs.git',
  priority: 'high'
});

// Search with filters
const results = await api.search('database migrations', {
  category: 'database',
  limit: 10
});
```

## Python Client Example

```python
import requests
from typing import Optional, Dict, List

class DocsMCPClient:
    def __init__(self, base_url: str = "http://localhost:3000/api"):
        self.base_url = base_url
        self.session = requests.Session()
    
    def generate_context(
        self,
        task: str,
        language: Optional[str] = None,
        framework: Optional[str] = None,
        max_results: int = 20
    ) -> Dict:
        """Generate context for a coding task."""
        payload = {
            "task": task,
            "maxResults": max_results
        }
        
        if language:
            payload["language"] = language
        if framework:
            payload["framework"] = framework
        
        response = self.session.post(
            f"{self.base_url}/context/generate",
            json=payload
        )
        response.raise_for_status()
        return response.json()
    
    def search(self, query: str, **filters) -> Dict:
        """Search documentation."""
        params = {"q": query, **filters}
        response = self.session.get(
            f"{self.base_url}/search",
            params=params
        )
        response.raise_for_status()
        return response.json()
    
    def sync_repository(self, repository: Optional[str] = None) -> Dict:
        """Sync one or all repositories."""
        payload = {}
        if repository:
            payload["repository"] = repository
        
        response = self.session.post(
            f"{self.base_url}/repos/sync",
            json=payload
        )
        response.raise_for_status()
        return response.json()

# Usage
client = DocsMCPClient()

# Generate context for a task
context = client.generate_context(
    task="implement OAuth2 authentication",
    framework="django",
    language="python"
)

print(f"Strategy used: {context['strategy']}")
print(f"Found {len(context['results'])} relevant documents")

for result in context['results'][:5]:
    print(f"\n{result['repository']} - {result['filepath']}")
    print(f"Score: {result['score']:.3f}")
    print(result['content'][:200] + "...")
```

## WebSocket Events (Coming Soon)

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  
  switch (event.type) {
    case 'sync:started':
      console.log(`Syncing ${event.repository}...`);
      break;
    
    case 'sync:progress':
      console.log(`${event.repository}: ${event.progress}%`);
      break;
    
    case 'sync:completed':
      console.log(`${event.repository} sync completed`);
      break;
    
    case 'document:indexed':
      console.log(`Indexed: ${event.filepath}`);
      break;
  }
});

// Subscribe to repository events
ws.send(JSON.stringify({
  type: 'subscribe',
  repositories: ['react-docs', 'vue-docs']
}));
```

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "error": "Repository not found",
  "message": "Repository 'unknown-repo' does not exist",
  "code": "REPO_NOT_FOUND"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found
- `500` - Internal Server Error

Example error handling:

```javascript
try {
  const results = await fetch('/api/context/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'search query' })
  });

  if (!results.ok) {
    const error = await results.json();
    console.error(`API Error: ${error.error} - ${error.message}`);
    return;
  }

  const data = await results.json();
  // Process results...
} catch (error) {
  console.error('Network error:', error);
}
```

## Rate Limiting (Future)

The API will implement rate limiting in production:
- 100 requests per minute for search/context endpoints
- 10 requests per minute for repository management
- 1000 requests per hour per IP address

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)