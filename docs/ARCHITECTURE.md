# Universal Documentation MCP Server Architecture

## Overview

The Universal Documentation MCP Server is a TypeScript-based system that indexes documentation from multiple git repositories, processes them into searchable chunks, and provides intelligent context to AI coding assistants through the Model Context Protocol (MCP).

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MCP Server Application                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │   CLI       │  │  MCP Server  │  │  REST API   │  │  WebSocket   │ │
│  │  Interface  │  │   Handler    │  │  Endpoints  │  │   Server     │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘ │
│         │                │                  │                 │         │
│  ┌──────┴────────────────┴──────────────────┴─────────────────┴──────┐ │
│  │                        Service Layer                               │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐              │ │
│  │  │  Git Sync   │  │   Document   │  │   Context   │              │ │
│  │  │  Service    │  │  Processor   │  │  Generator  │              │ │
│  │  └─────┬───────┘  └──────┬───────┘  └─────┬───────┘              │ │
│  │        │                 │                 │                       │ │
│  │  ┌─────┴────────┐  ┌────┴────────┐  ┌────┴────────┐              │ │
│  │  │  Embedding   │  │   Vector    │  │   Search    │              │ │
│  │  │   Service    │  │    Store    │  │   Engine    │              │ │
│  │  └──────────────┘  └─────────────┘  └─────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         Data Layer                                 │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐              │ │
│  │  │   Qdrant    │  │     Git      │  │   Config    │              │ │
│  │  │   Vector    │  │ Repositories │  │   Store     │              │ │
│  │  │  Database   │  │              │  │             │              │ │
│  │  └─────────────┘  └──────────────┘  └─────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Entry Points

#### CLI Interface (`cli.ts`)
- Command-line tool for setup and management
- Commands: init, add-repo, sync, status, search, integrate
- Handles configuration management and server lifecycle

#### MCP Server Handler (`server.ts`)
- Main MCP protocol implementation
- Handles tool registration and execution
- Manages client connections and requests

#### REST API (`routes/`)
- HTTP endpoints for management and queries
- CORS-enabled for web integrations
- RESTful resource management

#### WebSocket Server
- Real-time updates for sync status
- Live search and context generation
- Push notifications for changes

### 2. Service Layer

#### Git Sync Service (`services/git-sync.ts`)
- Clones and updates repositories
- Handles authentication (token, SSH)
- Tracks changes and triggers reprocessing
- Implements retry logic and error handling
- Supports webhooks for real-time updates

#### Document Processor (`services/document-processor.ts`)
- Detects and parses file types (MD, RST, HTML, code)
- Implements semantic chunking strategies
- Extracts metadata and relationships
- Maintains document hierarchy

#### Embedding Service (`services/embedding.ts`)
- Supports multiple embedding providers
- Local embeddings via @xenova/transformers
- Cloud providers (OpenAI, Google, Azure)
- Caches embeddings for performance

#### Vector Store Service (`services/vector-store.ts`)
- Abstracts vector database operations
- Primary support for Qdrant
- Handles collection management
- Implements efficient search algorithms

#### Context Generator (`services/context-generator.ts`)
- Intent detection and analysis
- Multi-strategy retrieval (semantic, keyword, hybrid)
- Intelligent ranking and scoring
- Progressive context building

### 3. Data Layer

#### Vector Database (Qdrant)
- Stores document embeddings
- Enables semantic search
- Maintains metadata and relationships
- Supports filtering and faceting

#### Git Repositories
- Local clones of documentation sources
- Organized by repository configuration
- Supports multiple branches/tags

#### Configuration Store
- JSON/YAML configuration files
- Preset management
- Runtime configuration updates

## Data Flow

### 1. Repository Sync Flow
```
Git Remote → Git Sync Service → Local Clone → Document Processor
                                                      ↓
                                              Chunk Extraction
                                                      ↓
                                              Embedding Service
                                                      ↓
                                               Vector Database
```

### 2. Context Generation Flow
```
User Query → Context Generator → Intent Analysis
                                        ↓
                              Search Strategy Selection
                                        ↓
                              Vector/Keyword Search
                                        ↓
                               Result Ranking
                                        ↓
                              Context Assembly
                                        ↓
                               Response
```

## Key Design Decisions

### 1. Semantic Chunking
- Preserves document structure and meaning
- Respects code boundaries and markdown sections
- Maintains cross-references and relationships

### 2. Hybrid Search
- Combines vector similarity and keyword matching
- Weighted scoring based on repository priority
- Considers document freshness and relevance

### 3. Flexible Embedding
- Provider-agnostic design
- Support for local and cloud models
- Configurable per repository or globally

### 4. Extensibility
- Plugin architecture for custom processors
- Configurable context strategies
- Template system for output formatting

## Security Considerations

### 1. Authentication
- Support for multiple auth methods
- Secure credential storage
- Token refresh handling

### 2. Access Control
- Repository-level permissions
- API authentication
- Rate limiting

### 3. Data Privacy
- Local embedding options
- Configurable data retention
- Audit logging

## Performance Optimizations

### 1. Caching
- Embedding cache
- Search result cache
- Git operation cache

### 2. Concurrent Processing
- Parallel repository syncing
- Batch embedding generation
- Async document processing

### 3. Incremental Updates
- Change detection
- Partial reindexing
- Efficient sync strategies

## Deployment Architecture

### 1. Standalone Mode
- Single process deployment
- Embedded Qdrant option
- Suitable for individual developers

### 2. Distributed Mode
- Separate services via Docker
- External Qdrant cluster
- Horizontal scaling support

### 3. Cloud Native
- Kubernetes deployment
- Managed vector databases
- Auto-scaling capabilities