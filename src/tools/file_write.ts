// File write tool
import { readFile, writeFile } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { expandPath } from './paths.js';
import { makeUnifiedDiff } from './diff_helper.js';

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

      let oldContent = '';
      try {
        oldContent = await readFile(resolved, 'utf-8');
      } catch {
        // File didn't exist — treat as create (empty → new content diff)
      }

      const dir = dirname(resolved);
      await mkdir(dir, { recursive: true });
      await writeFile(resolved, content);

      const diff = makeUnifiedDiff(resolved, oldContent, content);
      const verb = oldContent ? 'overwrote' : 'created';
      return {
        content: `File ${verb}: ${resolved}${diff ? '\n\n```diff\n' + diff + '\n```' : ''}`,
        diff,
      };
    } catch (error) {
      return {
        content: `Error writing file: ${error}`,
        isError: true,
      };
    }
  },
};