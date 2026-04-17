// File edit tool - find/replace in existing files
import { readFile, writeFile } from 'fs/promises';
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { expandPath } from './paths.js';
import { makeUnifiedDiff } from './diff_helper.js';

const paramsSchema = z.object({
  file_path: z.string().describe('Path to the file to edit'),
  old_string: z.string().describe('Text to find'),
  new_string: z.string().describe('Text to replace with'),
});

export const fileEditTool: Tool = {
  name: 'file_edit',
  description: 'Edit an existing file by replacing specific text',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { file_path, old_string, new_string } = paramsSchema.parse(params);

    try {
      const resolved = expandPath(file_path);
      const content = await readFile(resolved, 'utf-8');

      if (!content.includes(old_string)) {
        return {
          content: `Error: old_string not found in file`,
          isError: true,
        };
      }

      const newContent = content.replace(old_string, new_string);
      await writeFile(resolved, newContent);

      const diff = makeUnifiedDiff(resolved, content, newContent);
      return {
        content: `File edited: ${resolved}${diff ? '\n\n```diff\n' + diff + '\n```' : ''}`,
        diff,
      };
    } catch (error) {
      return {
        content: `Error editing file: ${error}`,
        isError: true,
      };
    }
  },
};