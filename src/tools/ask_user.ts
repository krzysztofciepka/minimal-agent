// Ask user tool - prompt user with choices
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';

const paramsSchema = z.object({
  question: z.string().describe('Question to ask the user'),
  options: z.array(z.string()).describe('Available options'),
});

export const askUserTool: Tool = {
  name: 'ask_user',
  description: 'Prompt the user with a question and choices',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    // This tool is special - it requires actual user interaction
    // In the CLI context, this would be handled differently
    const { question, options } = paramsSchema.parse(params);

    return {
      content: `Question: ${question}\nOptions: ${options.join(', ')}\n\n(User input required)`,
    };
  },
};