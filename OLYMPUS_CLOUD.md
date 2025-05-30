# Olympus Cloud MCP Documentation Server 🏛️

This document contains Olympus Cloud specific information and setup instructions for the MCP Documentation Server.

## 🏛️ Olympus Cloud Integration

The MCP Documentation Server is specifically configured to work seamlessly with the entire Olympus Cloud ecosystem, providing AI coding assistants with relevant context when working with Olympus Cloud repositories.

### Ecosystem Components

The server indexes documentation from the following Olympus Cloud components:

| Component | Type | Description |
|-----------|------|-------------|
| **Olympus** | Hub | Core platform hub for enterprise applications |
| **Nebula** | Hub | Cloud-native service mesh and infrastructure hub |
| **Hermes** | Hub | Communication and integration hub |
| **Apollo** | App | Analytics and business intelligence platform |
| **Athena** | App | Knowledge management and decision support system |
| **Zeus** | App | Cloud resource management and orchestration |
| **Hera** | App | Enterprise workflow automation |

### 🚀 One-Command Setup for Olympus Cloud

For Olympus Cloud developers, a streamlined setup process is available:

```bash
# Olympus Cloud Setup (Recommended)
./setup-olympus.sh      # Linux/macOS
.\setup-olympus.ps1    # Windows PowerShell
```

This script performs the following Olympus Cloud-specific actions:

1. Configures the MCP server with Olympus Cloud presets
2. Clones all relevant Olympus Cloud repositories
3. Sets up Claude Desktop integration with Olympus Cloud context
4. Configures GitHub Copilot API integration for Olympus Cloud repositories
5. Sets up VS Code extensions with proper configuration
6. Indexes all Olympus Cloud repositories with proper metadata
7. Creates AI-friendly search commands specific to Olympus Cloud

### Olympus Cloud AI Commands

The following commands are available specifically for Olympus Cloud development:

- `olympus-ai implement <feature>` - Get implementation guidance for Olympus features
- `olympus-ai integrate <component>` - Get integration instructions for Olympus components
- `olympus-ai architecture <system>` - Explain the architecture of an Olympus system
- `olympus-ai patterns <pattern>` - Describe Olympus design patterns
- `olympus-ai best-practices <area>` - Show Olympus best practices for specific areas

### Olympus Cloud Configuration Presets

A set of optimized configuration presets for Olympus Cloud is included:

```bash
# Use Olympus Cloud production settings
cp config/presets/olympus-cloud-production.json config/config.json

# Use Olympus Cloud development settings (more verbose logging)
cp config/presets/olympus-cloud-development.json config/config.json
```

### Azure Integration

Olympus Cloud specifically supports Azure services and best practices. The MCP server provides context-aware assistance for:

1. Azure infrastructure as code (ARM templates, Bicep)
2. Azure DevOps integration
3. Azure Functions and App Services
4. Azure security and compliance requirements
5. .NET and C# best practices in an Azure context

## 🔧 Maintenance for Olympus Cloud Instances

### Updating Olympus Cloud Repositories

To update all Olympus Cloud repositories indexed by the MCP server:

```bash
npm run sync-olympus
```

### Monitoring Olympus Cloud MCP Server

For Olympus Cloud production environments, advanced monitoring is available:

```bash
npm run monitor-olympus
```

This provides insights into:

- Documentation freshness
- Query patterns from AI assistants
- System performance metrics
- Error rates and common failure modes

### Getting Help

For Olympus Cloud specific issues, contact:

- Internal support: #olympus-mcp-server channel on Slack
- Email: mcp-support@olympuscloud.com
- Documentation: https://docs.olympuscloud.com/mcp-server

## 📚 Additional Olympus Cloud Resources

- [Olympus Cloud Architecture Guide](https://olympuscloud.com/architecture)
- [Olympus Cloud API Documentation](https://api.olympuscloud.com)
- [Olympus Cloud Developer Hub](https://dev.olympuscloud.com)
- [Olympus Cloud Training Resources](https://learn.olympuscloud.com)
