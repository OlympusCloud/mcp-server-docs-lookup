/**
 * Core MCP Server - Clean, focused implementation
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ToolHandler } from './tool-handler';
import { PromptHandler } from './prompt-handler';
import { ResourceHandler } from './resource-handler';
import { ServiceManager } from './service-manager';
import logger from '../utils/logger';

export class MCPServer {
  private server: Server;
  private toolHandler: ToolHandler;
  private promptHandler: PromptHandler;
  private resourceHandler: ResourceHandler;
  private serviceManager: ServiceManager;
  private initialized: boolean = false;

  constructor() {
    this.server = new Server(
      {
        name: "olympus-docs-server",
        version: "1.2.0",
      },
      {
        capabilities: {
          prompts: {},
          resources: { subscribe: true },
          tools: {},
          logging: {},
        },
      }
    );

    this.serviceManager = new ServiceManager();
    this.toolHandler = new ToolHandler(this.serviceManager);
    this.promptHandler = new PromptHandler(this.serviceManager);
    this.resourceHandler = new ResourceHandler(this.serviceManager);

    this.setupRequestHandlers();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      logger.info('Initializing MCP Server...');
      
      await this.serviceManager.initialize();
      
      this.initialized = true;
      logger.info('MCP Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MCP Server:', error);
      throw error;
    }
  }

  private setupRequestHandlers(): void {
    // Tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.toolHandler.listTools();
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.toolHandler.callTool(request.params);
    });

    // Prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return this.promptHandler.listPrompts();
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      return this.promptHandler.getPrompt(request.params);
    });

    // Resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      return this.resourceHandler.listResources(request.params);
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return this.resourceHandler.readResource(request.params);
    });
  }

  async connect(transport: any): Promise<void> {
    await this.initialize();
    await this.server.connect(transport);
    logger.info('MCP Server connected');
  }

  async start(): Promise<void> {
    await this.initialize();
    logger.info('MCP Server started');
  }

  async shutdown(): Promise<void> {
    await this.serviceManager.shutdown();
    logger.info('MCP Server shut down');
  }
}
