import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { GitSyncService } from './services/git-sync';
import { RepositoryConfig } from './types/config';
import logger from './utils/logger';

interface WSMessage {
  type: string;
  data?: any;
  id?: string;
}

interface WSClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
}

export class DocumentWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient>;
  private gitSync: GitSyncService;

  constructor(server: Server, gitSync: GitSyncService) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.clients = new Map();
    this.gitSync = gitSync;
    this.setupEventHandlers();
    this.setupWebSocketHandlers();
  }

  private setupEventHandlers(): void {
    // Git sync events
    this.gitSync.on('sync:start', (repo: RepositoryConfig) => {
      this.broadcast({
        type: 'sync:started',
        data: {
          repository: repo.name,
          timestamp: new Date().toISOString()
        }
      }, repo.name);
    });

    this.gitSync.on('sync:complete', (repo: RepositoryConfig, changes: string[]) => {
      this.broadcast({
        type: 'sync:completed',
        data: {
          repository: repo.name,
          changes: changes.length,
          files: changes.slice(0, 10), // Send first 10 files
          timestamp: new Date().toISOString()
        }
      }, repo.name);
    });

    this.gitSync.on('sync:error', (repo: RepositoryConfig, error: Error) => {
      this.broadcast({
        type: 'sync:error',
        data: {
          repository: repo.name,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      }, repo.name);
    });

    this.gitSync.on('file:changed', (repo: RepositoryConfig, filepath: string) => {
      this.broadcast({
        type: 'document:changed',
        data: {
          repository: repo.name,
          filepath,
          timestamp: new Date().toISOString()
        }
      }, repo.name);
    });
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, _req) => {
      const clientId = this.generateClientId();
      const client: WSClient = {
        id: clientId,
        ws,
        subscriptions: new Set()
      };

      this.clients.set(clientId, client);
      logger.info('WebSocket client connected', { clientId });

      // Send welcome message
      this.sendToClient(client, {
        type: 'connected',
        data: {
          clientId,
          timestamp: new Date().toISOString()
        }
      });

      // Handle messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          this.handleMessage(client, message);
        } catch (error) {
          logger.error('Invalid WebSocket message', { error, clientId });
          this.sendToClient(client, {
            type: 'error',
            data: { message: 'Invalid message format' }
          });
        }
      });

      // Handle close
      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info('WebSocket client disconnected', { clientId });
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error', { error, clientId });
      });

      // Ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    });
  }

  private handleMessage(client: WSClient, message: WSMessage): void {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(client, message.data);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(client, message.data);
        break;

      case 'ping':
        this.sendToClient(client, { type: 'pong', id: message.id });
        break;

      case 'sync:request':
        this.handleSyncRequest(client, message.data);
        break;

      case 'search:live':
        this.handleLiveSearch(client, message.data);
        break;

      default:
        this.sendToClient(client, {
          type: 'error',
          data: { message: `Unknown message type: ${message.type}` }
        });
    }
  }

  private handleSubscribe(client: WSClient, data: any): void {
    const repositories = Array.isArray(data?.repositories) ? data.repositories : [];
    
    repositories.forEach((repo: string) => {
      client.subscriptions.add(repo);
    });

    // Subscribe to all if no specific repositories
    if (repositories.length === 0) {
      client.subscriptions.add('*');
    }

    this.sendToClient(client, {
      type: 'subscribed',
      data: {
        repositories: Array.from(client.subscriptions),
        timestamp: new Date().toISOString()
      }
    });

    logger.info('Client subscribed', { 
      clientId: client.id, 
      subscriptions: Array.from(client.subscriptions) 
    });
  }

  private handleUnsubscribe(client: WSClient, data: any): void {
    const repositories = Array.isArray(data?.repositories) ? data.repositories : [];
    
    repositories.forEach((repo: string) => {
      client.subscriptions.delete(repo);
    });

    this.sendToClient(client, {
      type: 'unsubscribed',
      data: {
        repositories,
        timestamp: new Date().toISOString()
      }
    });
  }

  private async handleSyncRequest(client: WSClient, data: any): Promise<void> {
    const repository = data?.repository;
    
    if (!repository) {
      this.sendToClient(client, {
        type: 'sync:error',
        data: { message: 'Repository name required' }
      });
      return;
    }

    // This would need to be implemented with access to config
    this.sendToClient(client, {
      type: 'sync:requested',
      data: {
        repository,
        message: 'Sync request received',
        timestamp: new Date().toISOString()
      }
    });
  }

  private async handleLiveSearch(client: WSClient, data: any): Promise<void> {
    // Placeholder for live search functionality
    // This would integrate with the search service
    this.sendToClient(client, {
      type: 'search:results',
      data: {
        query: data?.query,
        results: [],
        message: 'Live search not yet implemented'
      }
    });
  }

  private broadcast(message: WSMessage, repository?: string): void {
    this.clients.forEach(client => {
      if (this.shouldReceiveMessage(client, repository)) {
        this.sendToClient(client, message);
      }
    });
  }

  private shouldReceiveMessage(client: WSClient, repository?: string): boolean {
    if (client.subscriptions.has('*')) {
      return true;
    }
    
    if (repository && client.subscriptions.has(repository)) {
      return true;
    }

    return false;
  }

  private sendToClient(client: WSClient, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public broadcastCustom(type: string, data: any, repository?: string): void {
    this.broadcast({ type, data }, repository);
  }

  public getConnectedClients(): number {
    return this.clients.size;
  }

  public close(): void {
    this.wss.close();
    logger.info('WebSocket server closed');
  }
}

export default DocumentWebSocketServer;