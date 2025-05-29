export interface MCPRequest {
  method: string;
  params?: any;
  id?: string | number;
}

export interface MCPResponse {
  jsonrpc?: '2.0';
  result?: any;
  error?: MCPError;
  id?: string | number | null;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean; // Added this line back
  };
}

export interface MCPCapabilities {
  tools?: MCPTool[];
  version: string;
  name: string;
  description: string;
}