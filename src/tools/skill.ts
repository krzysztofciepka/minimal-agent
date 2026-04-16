// Skill tool - invoke skills
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import type { Tool, ToolResult, Skill } from '../types.js';

const paramsSchema = z.object({
  name: z.string().describe('Name of the skill to invoke'),
  args: z.string().optional().describe('Arguments for the skill'),
});

const SKILLS_DIR = join(homedir(), '.claude', 'skills');

export const skillTool: Tool = {
  name: 'skill',
  description: 'Invoke a skill by name',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { name, args } = paramsSchema.parse(params);

    try {
      // Load skill content
      const skillDir = join(SKILLS_DIR, name);
      const files = await readdir(skillDir);

      const mdFiles = files.filter(f => f.endsWith('.md'));
      if (mdFiles.length === 0) {
        return { content: `No skill found: ${name}`, isError: true };
      }

      const content = await readFile(join(skillDir, mdFiles[0]), 'utf-8');

      // Execute skill - return content for the agent to process
      return {
        content: [
          { type: 'text', text: `# Skill: ${name}\n\n${content}` },
        ],
      };
    } catch (error) {
      return {
        content: `Error loading skill: ${error}`,
        isError: true,
      };
    }
  },
};