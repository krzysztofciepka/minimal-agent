// File read tool
import { readFile } from 'fs/promises';
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';

const paramsSchema = z.object({
  file_path: z.string().describe('Path to the file to read'),
});

export const fileReadTool: Tool = {
  name: 'file_read',
  description: 'Read the contents of a file from the filesystem',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { file_path } = paramsSchema.parse(params);

    try {
      const content = await readFile(file_path, 'utf-8');
      return { content };
    } catch (error) {
      return {
        content: `Error reading file: ${error}`,
        isError: true,
      };
    }
  },
};