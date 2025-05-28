# Publishing to NPM

## Prerequisites

1. **NPM Account**: Ensure you have an NPM account with access to the `@olympuscloud` organization
2. **NPM Login**: Run `npm login` and authenticate
3. **Organization Access**: Make sure you have publish access to `@olympuscloud` scope

## Publishing Steps

### 1. Verify Build
```bash
npm run build
npm run lint
npm test
```

### 2. Version Management
```bash
# For patch release (bug fixes)
npm version patch

# For minor release (new features)
npm version minor

# For major release (breaking changes)
npm version major
```

### 3. Publish Package
```bash
# Dry run to check what will be published
npm publish --dry-run

# Actual publish
npm publish
```

### 4. Verify Publication
```bash
npm info @olympuscloud/mcp-docs-server
```

## Package Details

- **Name**: `@olympuscloud/mcp-docs-server`
- **Current Version**: `1.0.0`
- **Registry**: https://registry.npmjs.org/
- **Access**: Public
- **Repository**: https://github.com/OlympusCloud/mcp-server-docs-lookup

## Installation After Publish

```bash
# Global installation
npm install -g @olympuscloud/mcp-docs-server

# Local installation
npm install @olympuscloud/mcp-docs-server
```

## Usage After Install

```bash
# Olympus Cloud setup
olympus-mcp-setup --olympus

# General setup
olympus-mcp-setup --general

# Direct CLI usage
olympus-mcp init olympus-cloud
olympus-mcp sync
olympus-mcp search "authentication patterns"
```

## Post-Publish Tasks

1. Update README with installation instructions
2. Create GitHub release with changelog
3. Update documentation
4. Announce to team

## Troubleshooting

### Permission Issues
```bash
# Check organization membership
npm org ls olympuscloud

# Add user to organization (admin only)
npm org add olympuscloud <username>
```

### Authentication Issues
```bash
# Clear auth and re-login
npm logout
npm login
```

### Package Scope Issues
```bash
# Verify package configuration
npm config get registry
npm config get @olympuscloud:registry
```