# Olympus Cloud Quick Setup

Automated setup script for comprehensive Olympus Cloud documentation with Azure, .NET 9/10, NebusAI, and enterprise best practices.

## 🚀 One-Command Setup

### Linux/macOS
```bash
./setup-olympus.sh
```

### Windows (PowerShell)
```powershell
.\setup-olympus.ps1
```

## 📚 What Gets Installed

### Olympus Production Configuration
- **Azure Documentation** - Cloud services, architecture patterns, well-architected framework
- **.NET 9/10 Documentation** - Latest .NET and ASP.NET Core best practices
- **Azure Architecture Center** - Reference architectures and design patterns
- **Security Benchmarks** - Azure security compliance and best practices
- **Enterprise Patterns** - Microservices and cloud-native architectures
- **Cloud Adoption Framework** - Enterprise governance and management

### NebusAI Enhanced Configuration  
- **AI/ML Frameworks** - TensorFlow, PyTorch, Hugging Face Transformers
- **AI APIs** - OpenAI Cookbook, Anthropic Claude, Azure Cognitive Services
- **Vector Databases** - Qdrant documentation and similarity search
- **AI Orchestration** - LangChain, FastAPI for AI applications
- **AI Engineering** - Patterns and best practices for AI development

## 🔧 Configuration Options

The setup script offers 4 configuration options:

1. **Olympus Production** - Azure + .NET 9/10 + Enterprise patterns (9 repositories)
2. **NebusAI Enhanced** - AI/ML frameworks + APIs + Vector databases (10 repositories)
3. **Both (Comprehensive)** - Combined Olympus + NebusAI documentation (19 repositories)
4. **Custom** - Choose from any available preset

### Repository Counts by Configuration

- **Olympus Production**: 9 official Microsoft repositories
- **NebusAI Enhanced**: 10 AI/ML framework repositories  
- **Comprehensive**: 19 total repositories (all sources combined)

The "Both" option intelligently merges both configurations, providing comprehensive coverage of Azure, .NET, and AI/ML ecosystems.

## 📋 Prerequisites

- **Node.js 18+**
- **Docker** (for Qdrant vector database)
- **Git**
- **8GB+ RAM** (recommended for large documentation sets)

## 🎯 Real Documentation Sources

All sources use **real, official documentation repositories**:

### Azure & .NET
- `dotnet/docs` - Official .NET documentation
- `MicrosoftDocs/azure-docs` - Azure services documentation
- `dotnet/AspNetCore.Docs` - ASP.NET Core documentation
- `MicrosoftDocs/architecture-center` - Azure architecture patterns
- `MicrosoftDocs/well-architected` - Well-architected framework
- `MicrosoftDocs/cloud-adoption-framework` - Enterprise governance

### AI/ML & NebusAI
- `huggingface/transformers` - Transformers library documentation
- `openai/openai-cookbook` - OpenAI integration examples
- `langchain-ai/langchain` - LangChain framework documentation
- `pytorch/pytorch` - PyTorch deep learning framework
- `tensorflow/docs` - TensorFlow documentation
- `qdrant/qdrant` - Vector database documentation

## ⚡ Quick Commands

```bash
# Check status
node dist/cli.js status

# Search documentation
node dist/cli.js search "Azure Functions best practices"
node dist/cli.js search ".NET 9 performance improvements"
node dist/cli.js search "LangChain vector store integration"

# Sync documentation (run after setup)
node dist/cli.js sync

# Start MCP server for Claude Code
node dist/cli.js start --stdio

# Start API server for GitHub Copilot
node dist/cli.js start --mode api --port 3001
```

## 🔗 Integration Examples

### Claude Code Integration
```json
{
  "mcpServers": {
    "olympus-docs": {
      "command": "node",
      "args": ["/path/to/mcp-server-docs-lookup/dist/server.js", "--stdio"],
      "cwd": "/path/to/mcp-server-docs-lookup"
    }
  }
}
```

### Usage with AI Assistants
```
"Search for Azure Functions deployment best practices"
"Show me .NET 9 dependency injection patterns"
"Find LangChain examples for document question answering"
"Get Azure Well-Architected Framework security guidelines"
"Find patterns for microservices communication in .NET"
```

## 📊 Expected Results

After successful setup and sync:

- **10,000+** documentation pages indexed
- **50,000+** code examples and snippets
- **Vector embeddings** for semantic search
- **Sub-second** search response times
- **Comprehensive coverage** of Azure, .NET, and AI/ML topics

## 🔧 Customization

To add your own documentation sources:

1. Edit `config/config.json` after setup
2. Add new repository configurations
3. Run `node dist/cli.js sync` to index new content

Example:
```json
{
  "name": "my-internal-docs",
  "url": "https://github.com/myorg/docs.git",
  "branch": "main",
  "authType": "token",
  "credentials": {"token": "ghp_xxx"},
  "priority": "high",
  "category": "internal"
}
```

## ⚠️ Important Notes

- **First sync takes 10-30 minutes** - Downloads and processes several GB of documentation
- **Requires stable internet** - Multiple large repositories are cloned
- **Qdrant must be running** - Docker container started automatically
- **Local storage** - Documentation stored in `data/` directory (can be large)

## 🎉 What's Next

1. **Run the setup script** - Automated installation and configuration
2. **Choose your configuration** - Olympus, NebusAI, or both
3. **Sync documentation** - Download and index all sources  
4. **Integrate with AI agent** - Claude Code, GitHub Copilot, etc.
5. **Start coding** - Enhanced documentation context in your development workflow

The setup creates a production-ready documentation server that transforms your AI coding experience with comprehensive, searchable knowledge from official sources! 🚀