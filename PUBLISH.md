# Publishing to GitHub Packages (Private)

## Prerequisites

1. **GitHub Account**: Ensure you have a GitHub account with access to the `OlympusCloud` organization
2. **GitHub Token**: Create a Personal Access Token with `packages:write` permission
3. **Organization Access**: Make sure you have write access to OlympusCloud packages

## Publishing Steps

### 1. Setup GitHub Authentication
```bash
# Set your GitHub token (replace with your actual token)
export GITHUB_TOKEN=ghp_your_token_here

# Or add to ~/.npmrc globally
echo "//npm.pkg.github.com/:_authToken=YOUR_TOKEN" >> ~/.npmrc
```

### 2. Verify Build
```bash
npm run build
npm run lint
npm test
```

### 3. Version Management
```bash
# For patch release (bug fixes)
npm version patch

# For minor release (new features)
npm version minor

# For major release (breaking changes)
npm version major
```

### 4. Publish to GitHub Packages
```bash
# Dry run to check what will be published
npm publish --dry-run

# Actual publish to GitHub Packages
npm publish
```

### 5. Verify Publication
```bash
# Check GitHub Packages
npm view @olympuscloud/mcp-docs-server --registry https://npm.pkg.github.com/
```

## Package Details

- **Name**: `@olympuscloud/mcp-docs-server`
- **Current Version**: `1.0.0`
- **Registry**: https://npm.pkg.github.com/
- **Access**: Private (OlympusCloud organization)
- **Repository**: https://github.com/OlympusCloud/mcp-server-docs-lookup

## Installation After Publish

```bash
# Configure registry for @olympuscloud scope
npm config set @olympuscloud:registry https://npm.pkg.github.com/

# Authenticate (using your GitHub token)
npm login --scope=@olympuscloud --registry=https://npm.pkg.github.com/

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