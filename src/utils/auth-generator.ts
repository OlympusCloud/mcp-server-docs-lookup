#!/usr/bin/env node

import { authService } from '../middleware/auth';
import { generateApiCredentials } from '../middleware/api-protection';
import * as fs from 'fs/promises';
// import * as path from 'path';

async function generateAuthConfig() {
  console.log('🔐 Generating authentication configuration...\n');

  // Generate API keys for different roles
  const adminKey = authService.generateApiKey('Admin Key', 'admin', ['*']);
  const userKey = authService.generateApiKey('User Key', 'user', [
    'search:read',
    'context:read',
    'repos:read'
  ]);
  const webhookKey = authService.generateApiKey('Webhook Key', 'webhook', [
    'webhooks:write',
    'repos:sync'
  ]);

  // Generate API protection credentials
  const apiProtection = generateApiCredentials();

  const config = {
    apiKeys: [
      {
        id: adminKey.id,
        key: adminKey.key,
        name: 'Admin Key',
        role: 'admin',
        scopes: ['*']
      },
      {
        id: userKey.id,
        key: userKey.key,
        name: 'User Key',
        role: 'user',
        scopes: ['search:read', 'context:read', 'repos:read']
      },
      {
        id: webhookKey.id,
        key: webhookKey.key,
        name: 'Webhook Key',
        role: 'webhook',
        scopes: ['webhooks:write', 'repos:sync']
      }
    ],
    apiProtection: {
      secret: apiProtection.secret,
      exampleHeaders: apiProtection.exampleHeaders
    },
    jwtSecret: Buffer.from(Math.random().toString(36).substring(2) + Date.now().toString(36)).toString('base64')
  };

  // Write to .env file
  const envContent = `
# Authentication Configuration
JWT_SECRET=${config.jwtSecret}
JWT_EXPIRY=24h

# API Keys (JSON format)
API_KEYS='${JSON.stringify(config.apiKeys)}'

# API Protection
API_SIGNING_SECRET=${config.apiProtection.secret}

# Rate Limiting (optional Redis connection)
# REDIS_URL=redis://localhost:6379

# Security
CORS_ORIGINS=http://localhost:*,https://localhost:*
# ALLOWED_IPS=127.0.0.1,::1
# TRUSTED_PROXIES=127.0.0.1
`;

  await fs.writeFile('.env', envContent.trim());

  // Write example usage to file
  const exampleUsage = `
# MCP Server Authentication Examples

## Using API Keys

### Admin Access
curl -H "X-API-Key: ${adminKey.key}" http://localhost:3000/api/search?q=test

### User Access
curl -H "X-API-Key: ${userKey.key}" http://localhost:3000/api/context/generate \\
  -H "Content-Type: application/json" \\
  -d '{"task": "explain authentication"}'

### Webhook Access
curl -H "X-API-Key: ${webhookKey.key}" http://localhost:3000/api/webhooks/github \\
  -H "Content-Type: application/json" \\
  -X POST \\
  -d '{"repository": "example/repo", "action": "push"}'

## Using JWT

### Get JWT Token
curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"apiKey": "${userKey.key}"}'

### Use JWT Token
curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:3000/api/search?q=test

## Using API Protection (for sensitive endpoints)

Example headers required:
${JSON.stringify(apiProtection.exampleHeaders, null, 2)}

### Protected Request
curl -H "X-API-Key: ${adminKey.key}" \\
  -H "X-API-Timestamp: ${apiProtection.exampleHeaders['X-API-Timestamp']}" \\
  -H "X-API-Nonce: ${apiProtection.exampleHeaders['X-API-Nonce']}" \\
  -H "X-API-Signature: ${apiProtection.exampleHeaders['X-API-Signature']}" \\
  http://localhost:3000/api/repos/sync

## Available Scopes

- \`*\` - Full access (admin only)
- \`search:read\` - Read access to search endpoints
- \`context:read\` - Read access to context generation
- \`repos:read\` - Read access to repository information
- \`repos:sync\` - Permission to trigger repository sync
- \`webhooks:write\` - Permission to configure webhooks
- \`config:write\` - Permission to modify configuration
- \`metrics:read\` - Permission to view metrics
`;

  await fs.writeFile('AUTH_EXAMPLES.md', exampleUsage.trim());

  console.log('✅ Authentication configuration generated!\n');
  console.log('Files created:');
  console.log('  - .env (environment configuration)');
  console.log('  - AUTH_EXAMPLES.md (usage examples)\n');
  console.log('⚠️  Keep your .env file secure and never commit it to version control!');
  console.log('\nGenerated API Keys:');
  console.log(`  Admin: ${adminKey.key}`);
  console.log(`  User: ${userKey.key}`);
  console.log(`  Webhook: ${webhookKey.key}`);
}

if (require.main === module) {
  generateAuthConfig().catch(console.error);
}

export { generateAuthConfig };