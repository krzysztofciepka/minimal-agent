// OpenAI-compatible API client
import type { Message, ChatCompletionRequest, ChatCompletionResponse, ToolResult } from './types.js';
import { loadConfig } from './config.js';

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
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<ChatCompletionResponse>;
  }

  async chatWithTools(
    messages: Message[],
    tools: unknown[]
  ): Promise<{ message: Message; toolResults: Array<{ toolCallId: string; result: ToolResult }> }> {
    // Skip tools for models that don't support them well
    const model = this.model.toLowerCase();
    const useTools = !model.includes('minimax');

    const response = await this.chat({
      model: this.model,
      messages,
      tools: useTools ? tools : undefined,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No response choice');
    }

    const message = choice.message;
    const toolResults: Array<{ toolCallId: string; result: ToolResult }> = [];

    // Handle tool calls if present
    if ('tool_calls' in message && message.tool_calls && message.tool_calls.length > 0) {
      const toolCalls = message.tool_calls;
      for (let i = 0; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i];
        toolResults.push({
          toolCallId: toolCall.id,
          result: { content: 'Tool execution placeholder' },
        });
      }
    }

    return { message, toolResults };
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }
}

export const apiClient = new APIClient();