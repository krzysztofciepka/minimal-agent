// Core types for minimal-agent

export interface ToolResult {
  content: string | Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: unknown; // Zod schema
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  tool_calls?: ToolCall[];
}

export interface Provider {
  api_url: string;
  api_key: string;
  models: string[];
}

export interface MCPServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface Config {
  providers: Record<string, Provider>;
  active_provider: string;
  active_model: string;
  mcp_servers: Record<string, MCPServer>;
}

export interface Skill {
  name: string;
  description: string;
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  tools?: unknown[];
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: Message;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}