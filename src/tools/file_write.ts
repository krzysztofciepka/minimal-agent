// File write tool
import { writeFile } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { expandPath } from './paths.js';

const paramsSchema = z.object({
  file_path: z.string().describe('Path to write to'),
  content: z.string().describe('Content to write'),
});

export const fileWriteTool: Tool = {
  name: 'file_write',
  description: 'Create or overwrite a file with content',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { file_path, content } = paramsSchema.parse(params);

    try {
      const resolved = expandPath(file_path);
      const dir = dirname(resolved);
      await mkdir(dir, { recursive: true });

      await writeFile(resolved, content);
      return { content: `File written: ${resolved}` };
    } catch (error) {
      return {
        content: `Error writing file: ${error}`,
        isError: true,
      };
    }
  },
};