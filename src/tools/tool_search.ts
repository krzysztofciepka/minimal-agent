// Tool search tool - search available tools
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { getTools } from './index.js';

const paramsSchema = z.object({
  query: z.string().describe('Search query for tools'),
});

export const toolSearchTool: Tool = {
  name: 'tool_search',
  description: 'Search for available tools by name or description',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { query } = paramsSchema.parse(params);
    const tools = getTools();
    const q = query.toLowerCase();

    const matches = tools.filter(
      t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );

    if (matches.length === 0) {
      return { content: 'No tools found matching query' };
    }

    const output = matches
      .map(t => `- **${t.name}**: ${t.description}`)
      .join('\n');

    return { content: output };
  },
};