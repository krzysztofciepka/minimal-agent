// OpenAI-compatible API client with agentic tool-use loop
import type {
  Message,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ToolCall,
  ToolResult,
} from './types.js';
import { loadConfig } from './config.js';
import { getToolByName, getToolsAsFunctions } from './tools/index.js';

const MAX_TOOL_ITERATIONS = 25;

export interface ToolExecution {
  name: string;
  args: string;
  result: ToolResult;
}

export interface ChatResult {
  message: Message;
  messages: Message[];
  toolExecutions: ToolExecution[];
}

function toolResultToString(result: ToolResult): string {
  const base =
    typeof result.content === 'string'
      ? result.content
      : result.content
          .map((part) => (part.type === 'text' ? part.text : JSON.stringify(part)))
          .join('\n');
  // The content already embeds a ```diff block when a tool produced one,
  // so we don't re-append result.diff here.
  return base;
}

function extractToolCalls(message: Message): ToolCall[] {
  const raw = (message as unknown as { tool_calls?: unknown[] }).tool_calls;
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((tc: unknown) => {
      const obj = tc as {
        id?: string;
        name?: string;
        arguments?: string;
        function?: { name?: string; arguments?: string };
      };
      const name = obj.function?.name ?? obj.name;
      const args = obj.function?.arguments ?? obj.arguments ?? '{}';
      if (!name) return null;
      return {
        id: obj.id ?? `call_${Math.random().toString(36).slice(2)}`,
        name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args),
      };
    })
    .filter((tc): tc is ToolCall => tc !== null);
}

export class APIClient {
  private baseUrl: string = '';
  private apiKey: string = '';
  private model: string = '';

  async init(): Promise<void> {
    const config = await loadConfig();
    const provider = config.providers[config.active_provider];
    if (!provider) {
      throw new Error('No provider configured');
    }
    this.baseUrl = provider.api_url;
    this.apiKey = provider.api_key;
    this.model = config.active_model;
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const body = {
      ...request,
      messages: request.messages.map((m) => {
        const out: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.toolCallId) out.tool_call_id = m.toolCallId;
        if (m.toolName && m.role === 'tool') out.name = m.toolName;
        if ('tool_calls' in m && (m as any).tool_calls) {
          out.tool_calls = (m as any).tool_calls;
        }
        return out;
      }),
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<ChatCompletionResponse>;
  }

  async chatWithTools(
    messages: Message[],
    opts?: { onToolCall?: (exec: ToolExecution) => void },
  ): Promise<ChatResult> {
    const tools = getToolsAsFunctions();
    let current: Message[] = [...messages];
    const executions: ToolExecution[] = [];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await this.chat({
        model: this.model,
        messages: current,
        tools,
      });

      const choice = response.choices[0];
      if (!choice) throw new Error('No response choice');

      const assistantMessage = choice.message;
      current = [...current, assistantMessage];

      const toolCalls = extractToolCalls(assistantMessage);
      if (toolCalls.length === 0) {
        return {
          message: assistantMessage,
          messages: current,
          toolExecutions: executions,
        };
      }

      for (const call of toolCalls) {
        const tool = getToolByName(call.name);
        let result: ToolResult;
        try {
          const args = call.arguments ? JSON.parse(call.arguments) : {};
          result = tool
            ? await tool.execute(args)
            : { content: `Unknown tool: ${call.name}`, isError: true };
        } catch (err: any) {
          result = {
            content: `Tool error: ${err?.message ?? String(err)}`,
            isError: true,
          };
        }

        const execution: ToolExecution = {
          name: call.name,
          args: call.arguments,
          result,
        };
        executions.push(execution);
        opts?.onToolCall?.(execution);

        current = [
          ...current,
          {
            role: 'tool',
            content: toolResultToString(result),
            toolCallId: call.id,
            toolName: call.name,
          },
        ];
      }
    }

    const last = current[current.length - 1];
    return {
      message: {
        role: 'assistant',
        content: `(tool-use loop hit ${MAX_TOOL_ITERATIONS}-iteration limit; last message: ${last?.role})`,
      },
      messages: current,
      toolExecutions: executions,
    };
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }
}

export const apiClient = new APIClient();
