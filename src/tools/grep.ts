// Grep tool - search file contents
import { readdir, readFile } from 'fs/promises';
import { stat } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';

const paramsSchema = z.object({
  pattern: z.string().describe('Regular expression to search for'),
  path: z.string().optional().describe('File or directory to search in'),
  glob: z.string().optional().describe('Glob pattern to filter files'),
});

export const grepTool: Tool = {
  name: 'grep',
  description: 'Search file contents using regular expressions',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { pattern, path = '.', glob } = paramsSchema.parse(params);

    try {
      const regex = new RegExp(pattern, 'g');
      const results: string[] = [];

      async function searchDir(dir: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            await searchDir(fullPath);
          } else if (entry.isFile()) {
            if (glob && !matchGlob(entry.name, glob)) continue;
            try {
              const content = await readFile(fullPath, 'utf-8');
              if (regex.test(content)) {
                results.push(`${fullPath}: ${content.substring(0, 100)}...`);
              }
              regex.lastIndex = 0;
            } catch {
              // Skip binary files
            }
          }
        }
      }

      await searchDir(path);

      if (results.length === 0) {
        return { content: 'No matches found' };
      }

      return { content: results.join('\n') };
    } catch (error) {
      return {
        content: `Error searching: ${error}`,
        isError: true,
      };
    }
  },
};

function matchGlob(filename: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(filename);
}