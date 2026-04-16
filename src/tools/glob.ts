// Glob tool - find files by pattern
import { Glob } from 'bun';
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { expandPath } from './paths.js';

const paramsSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files'),
  path: z.string().optional().describe('Directory to search in (default: current)'),
});

export const globTool: Tool = {
  name: 'glob',
  description: 'Find files matching a glob pattern',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { pattern, path } = paramsSchema.parse(params);

    try {
      const cwd = path ? expandPath(path) : process.cwd();
      const glob = new Glob(pattern);
      const files: string[] = [];
      for await (const file of glob.scan({ cwd })) {
        files.push(file);
      }
      return { content: files.length ? files.join('\n') : 'No files matched' };
    } catch (error) {
      return {
        content: `Error finding files: ${error}`,
        isError: true,
      };
    }
  },
};