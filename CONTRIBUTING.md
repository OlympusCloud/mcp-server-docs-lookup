# Contributing to Universal Documentation MCP Server

Thank you for your interest in contributing to the Universal Documentation MCP Server! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and welcoming to all contributors.

## How to Contribute

### Reporting Issues

1. Check existing issues to avoid duplicates
2. Use issue templates when available
3. Provide clear, detailed information:
   - Environment details (OS, Node version)
   - Steps to reproduce
   - Expected vs actual behavior
   - Error messages and logs

### Suggesting Features

1. Check existing feature requests
2. Clearly describe the use case
3. Explain how it benefits users
4. Consider implementation complexity

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Update documentation as needed
7. Commit with clear messages
8. Push to your fork
9. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 18+
- Docker (for Qdrant)
- Git

### Local Development

```bash
# Clone your fork
git clone https://github.com/your-username/mcp-server-docs-lookup.git
cd mcp-server-docs-lookup

# Install dependencies
npm install

# Run setup
npm run setup

# Start development
npm run dev
```

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm test -- --testPathPattern=unit

# Integration tests
npm test -- --testPathPattern=integration

# E2E tests
npm test -- --testPathPattern=e2e

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Provide type definitions
- Avoid `any` types

### Code Style

- Follow existing code style
- Use ESLint: `npm run lint`
- Format with Prettier
- Use meaningful variable names
- Add comments for complex logic

### File Structure

```
src/
├── services/       # Core services
├── middleware/     # Express middleware
├── routes/         # API routes
├── types/          # TypeScript types
├── utils/          # Utility functions
└── config/         # Configuration
```

### Commit Messages

Follow conventional commits:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `test:` Test additions/changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Build/tooling changes

Examples:
```
feat: add support for RST document processing
fix: handle empty search results gracefully
docs: update API documentation for webhooks
test: add integration tests for auth middleware
```

## Testing Guidelines

### Test Structure

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = createTestInput();
      
      // Act
      const result = component.method(input);
      
      // Assert
      expect(result).toMatchExpectedOutput();
    });
  });
});
```

### Test Coverage

- Aim for 80%+ coverage
- Test edge cases
- Include error scenarios
- Mock external dependencies

## Documentation

### Code Documentation

```typescript
/**
 * Generates context for a given task using vector search.
 * 
 * @param options - Context generation options
 * @param options.task - The task description
 * @param options.filters - Optional filters to apply
 * @returns Generated context with metadata
 * @throws {ValidationError} If options are invalid
 * 
 * @example
 * const context = await generateContext({
 *   task: 'implement authentication',
 *   filters: { repository: 'auth-docs' }
 * });
 */
```

### API Documentation

Update API docs when adding/changing endpoints:
- Method, path, description
- Request parameters
- Response format
- Error codes
- Examples

## Architecture Decisions

### Adding New Features

1. Discuss in an issue first
2. Consider backwards compatibility
3. Design for extensibility
4. Document configuration options
5. Add feature flags if experimental

### Dependencies

- Minimize external dependencies
- Evaluate security implications
- Check license compatibility
- Document why it's needed

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Run full test suite
4. Create release PR
5. Tag release after merge
6. Publish to npm

## Getting Help

- 💬 Discord: [Join our community](https://discord.gg/universal-mcp)
- 📖 Documentation: [docs.universal-mcp.dev](https://docs.universal-mcp.dev)
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/mcp-server-docs-lookup/issues)

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

Thank you for contributing! 🙏