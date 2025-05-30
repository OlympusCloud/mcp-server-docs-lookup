# Architecture Overview

This document provides a high-level overview of the MCP Server Docs Lookup architecture, explaining key components and their interactions.

## System Architecture

The MCP Server Docs Lookup implements a modular architecture designed for scalability, reliability, and extensibility. The system is built around the [Model Context Protocol](https://github.com/modelcontextprotocol/specification), providing a standardized way for AI assistants to access documentation context.

![Architecture Diagram](./docs/assets/architecture.png)

## Core Components

### 1. API Server

The API server provides HTTP and WebSocket endpoints implementing the Model Context Protocol. Key responsibilities include:

- Handling authentication and request validation
- Rate limiting and security measures
- Routing requests to appropriate service components
- Health monitoring and metrics collection

### 2. Vector Store

The vector store component manages semantic search capabilities:

- Stores document chunks with their vector embeddings
- Provides efficient similarity search
- Supports filtering by metadata
- Uses Qdrant as the underlying vector database

### 3. Embedding Service

The embedding service generates vector representations from text:

- Supports multiple embedding providers:
  - Local: using @xenova/transformers (default)
  - Remote: OpenAI, Azure, etc.
- Manages batching and caching of embedding operations
- Handles embeddings for search queries and document chunks

### 4. Document Processor

The document processor handles parsing and chunking of documentation:

- Breaks documents into semantically meaningful chunks
- Extracts metadata from content
- Applies custom processing rules based on document type
- Supports markdown, plaintext, code, and other formats

### 5. Git Synchronization Service

The Git synchronization service keeps documentation repositories up to date:

- Clones and pulls from Git repositories
- Monitors for changes to trigger reindexing
- Supports scheduled synchronization
- Handles authentication with private repositories

### 6. Context Generator

The context generator builds relevant context for AI assistant queries:

- Combines vector search results with metadata
- Applies post-processing for better context quality
- Formats responses according to the MCP specification
- Manages context length and relevance thresholds

## Data Flow

1. **Documentation Ingestion Flow**:
   - Git repo changes → Git sync service → Document processor → Embedding service → Vector store

2. **Query Processing Flow**:
   - Client query → API server → Embedding service (for query) → Vector store (search) → Context generator → Client response

3. **Synchronization Flow**:
   - Scheduled sync → Git sync service → Change detection → Selective reprocessing → Vector store update

## Technical Stack

- **Runtime**: Node.js (v18+)
- **Vector Database**: Qdrant
- **Embedding Models**: Transformers.js (Xenova/all-MiniLM-L6-v2)
- **API**: Express.js with WebSockets
- **Repository Management**: isomorphic-git
- **Configuration**: JSON/YAML with schema validation

## Security Model

- **Authentication**: Optional JWT or API key authentication
- **Authorization**: Role-based access controls for APIs
- **Data Security**: Local processing of all content
- **Input Validation**: Strict validation for all inputs
- **Rate Limiting**: Configurable rate limits per endpoint
- **Security Headers**: Helmet.js for HTTP security headers

## Extension Points

The architecture supports several extension points:

1. **Custom Embedding Providers**: Add new embedding providers by implementing the embedding interface
2. **Document Processors**: Create custom document processors for specialized formats
3. **Metadata Extractors**: Implement custom metadata extraction logic
4. **Vector Search Plugins**: Extend vector search capabilities
5. **Authentication Modules**: Add custom authentication mechanisms

## Deployment Options

1. **Standalone**: Run as a standalone Node.js application
2. **Docker**: Deploy using the provided Docker image
3. **Kubernetes**: Use Kubernetes manifests for orchestrated deployment
4. **Development**: Local development mode with hot reloading
