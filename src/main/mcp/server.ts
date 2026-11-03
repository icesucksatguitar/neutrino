import { EventEmitter } from 'events';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class McpServer extends EventEmitter {
  private isRunning: boolean = false;
  private tools: Map<string, (args: any) => Promise<unknown>> = new Map();
  private toolDefinitions: McpTool[] = [];
  private logHistory: Array<{ timestamp: number; direction: 'in' | 'out'; method?: string; data: unknown }> = [];

  constructor() {
    super();
    this.registerDefaultTools();
  }

  public registerTool(tool: McpTool, handler: (args: any) => Promise<unknown>) {
    this.toolDefinitions.push(tool);
    this.tools.set(tool.name, handler);
  }

  public getToolDefinitions(): McpTool[] {
    return this.toolDefinitions;
  }

  public getLogs() {
    return this.logHistory.slice(-50);
  }

  public async handleMessage(rawMessage: string | object): Promise<McpResponse> {
    let req: McpRequest;
    try {
      req = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
    } catch {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
    }

    const id = req.id ?? null;
    this.logHistory.push({ timestamp: Date.now(), direction: 'in', method: req.method, data: req.params });
    if (this.logHistory.length > 100) this.logHistory.shift();

    try {
      switch (req.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'neutrino-browser-mcp',
                version: '0.1.0',
              },
              capabilities: {
                tools: {},
                resources: {},
              },
            },
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: this.toolDefinitions,
            },
          };

        case 'tools/call': {
          const params = req.params as { name: string; arguments?: any };
          if (!params || !params.name) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing tool name parameter' },
            };
          }

          const handler = this.tools.get(params.name);
          if (!handler) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Tool not found: ${params.name}` },
            };
          }

          const res = await handler(params.arguments || {});
          const response: McpResponse = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof res === 'string' ? res : JSON.stringify(res, null, 2),
                },
              ],
            },
          };

          this.logHistory.push({ timestamp: Date.now(), direction: 'out', method: params.name, data: res });
          this.emit('mcp-call', { tool: params.name, args: params.arguments, result: res });
          return response;
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${req.method}` },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err?.message || 'Internal error' },
      };
    }
  }

  private registerDefaultTools() {
    this.registerTool(
      {
        name: 'browser_get_status',
        description: 'Returns the current health, version, and capabilities of the Neutrino browser engine.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      async () => ({
        status: 'online',
        engine: 'Chromium / Blink',
        browser: 'Neutrino Browser',
        mcpReady: true,
        features: ['Brave-Shields', 'Zen-Sleep', 'Arc-Spaces', 'MCP-Server'],
      })
    );
  }

  public start() {
    this.isRunning = true;
    this.emit('started');
  }

  public stop() {
    this.isRunning = false;
    this.emit('stopped');
  }

  public getStatus() {
    return {
      running: this.isRunning,
      toolsCount: this.toolDefinitions.length,
      recentCalls: this.logHistory.length,
    };
  }
}
