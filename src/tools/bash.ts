// Bash tool
import { $ } from 'bun';
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';

const paramsSchema = z.object({
  command: z.string().describe('Shell command to execute'),
});

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a shell command',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { command } = paramsSchema.parse(params);

    try {
      const result = await $`${command}`.text();
      return { content: result };
    } catch (error) {
      return {
        content: `Error executing command: ${error}`,
        isError: true,
      };
    }
  },
};