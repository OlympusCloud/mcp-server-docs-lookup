import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import logger from '../utils/logger';

export interface WebSocketConfig {
  port?: number;
  server?: Server;
}

export class DocumentWebSocketServer {
  private wss: WebSocketServer | null = null;
  private readonly config: WebSocketConfig;

  constructor(config: WebSocketConfig = {}) {
    this.config = config;
  }

  async start(): Promise<void> {
    logger.info('Starting WebSocket server...');
    
    this.wss = new WebSocketServer({
      port: this.config.port ?? 8080,
      server: this.config.server
    });

    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('WebSocket client connected');
      
      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(ws, data);
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({ error: 'Invalid JSON message' }));
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });
    });

    logger.info(`WebSocket server started on port ${this.config.port ?? 8080}`);
  }

  private handleMessage(ws: WebSocket, data: any): void {
    // Simple echo for now - can be extended with more functionality
    ws.send(JSON.stringify({
      type: 'response',
      data: data,
      timestamp: new Date().toISOString()
    }));
  }

  async shutdown(): Promise<void> {
    if (this.wss) {
      logger.info('Shutting down WebSocket server...');
      
      // Close all connections
      this.wss.clients.forEach((ws) => {
        ws.close();
      });

      // Close the server
      await new Promise<void>((resolve, reject) => {
        this.wss!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.wss = null;
      logger.info('WebSocket server shut down');
    }
  }
}
