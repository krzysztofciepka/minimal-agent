// MCP tool integration
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
// Note: MCP SDK import would be dynamic to avoid init errors

const paramsSchema = z.object({
  server: z.string().describe('MCP server name'),
  tool: z.string().describe('Tool name to call'),
  arguments: z.record(z.unknown()).describe('Tool arguments'),
});

export const mcpTool: Tool = {
  name: 'mcp',
  description: 'Call a tool from an MCP server',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { server, tool, arguments: args } = paramsSchema.parse(params);

    // MCP integration placeholder
    // Would connect to configured MCP server and call tool
    return {
      content: `MCP tool call: ${server}.${tool}(${JSON.stringify(args)})\n\n(Note: MCP not yet connected)`,
    };
  },
};