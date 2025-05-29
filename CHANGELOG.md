# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-05-28

### Fixed
- Critical "Connection closed" error in Claude Code integration
- Memory management issues causing premature process termination
- Error handling in stdio communication that led to connection instability

### Added
- TypeScript implementation of mcp-server-wrapper for improved stability
- Robust error recovery mechanism for MCP servers
- Automatic server restart capability for uncaught exceptions
- Connection keep-alive functionality to prevent timeouts
- Comprehensive Claude troubleshooting guide
- Connection testing script for validation
- Updated documentation for Claude Code and VS Code integration

### Changed
- Improved mcp-launcher.js to prioritize TypeScript implementation
- Enhanced mcp-stdio.ts with progressive error handling
- Updated build process to ensure proper permissions on executable files

## [1.0.4] - 2024-04-15

### Fixed
- VS Code integration issues for Windows users
- Memory leaks in vector storage service

## [1.0.0] - 2024-01-27

### Added
- Initial release of Universal Documentation MCP Server
- Multi-repository git synchronization with scheduled updates
- Vector-based semantic search using Qdrant
- Progressive context generation (overview → detailed → comprehensive)
- Support for Markdown, RST, and HTML documentation
- Local and OpenAI embedding providers
- JWT and API key authentication
- Role-based authorization with scopes
- Rate limiting with Redis support
- API protection with request signing
- Comprehensive metrics and monitoring
- WebSocket support for real-time updates
- Webhook endpoints for GitHub/GitLab
- Plugin system for extensibility
- Template engine for output formatting
- Data retention and cleanup policies
- Backup and recovery system
- Docker and Kubernetes deployment support
- VS Code extension
- CLI interface for management
- Repository presets:
  - general-web (MDN, React, Vue, Node.js)
  - dotnet-azure (.NET and Azure docs)
  - owasp-security (Security guidelines)
  - ai-ml (AI/ML frameworks)
  - data-engineering (Data tools)
  - olympus-cloud (Platform docs)

### Security
- CORS and CSP protection
- IP whitelisting support
- Replay attack protection
- Comprehensive audit logging

### Performance
- Semantic document chunking with overlap
- Batch embedding generation
- Efficient vector search (<100ms)
- Response caching
- Circuit breakers for external services

### Developer Experience
- TypeScript with strict mode
- Comprehensive test suite (unit, integration, E2E)
- CI/CD with GitHub Actions
- Automated setup scripts
- Detailed documentation
- Example configurations

## [Unreleased]

### Planned
- Google Vertex AI embedding support
- Azure OpenAI embedding support
- Additional language support (Python, Java docs)
- GraphQL API endpoint
- Admin dashboard UI
- Distributed caching with Redis Cluster
- Multi-region deployment support
- Advanced analytics and insights
- Custom embedding models
- Fine-tuning capabilities