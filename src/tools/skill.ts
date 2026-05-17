// Skill tool - invoke skills (user dir overrides built-ins)
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { getBuiltinSkill } from '../skills/index.js';

const paramsSchema = z.object({
  name: z.string().describe('Name of the skill to invoke'),
  args: z.string().optional().describe('Arguments for the skill'),
});

function skillsDir(): string {
  return join(process.env.HOME ?? homedir(), '.claude', 'skills');
}

async function readUserSkill(name: string): Promise<string | undefined> {
  try {
    const skillDir = join(skillsDir(), name);
    const files = await readdir(skillDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    if (mdFiles.length === 0) return undefined;
    return await readFile(join(skillDir, mdFiles[0]), 'utf-8');
  } catch {
    return undefined;
  }
}

export const skillTool: Tool = {
  name: 'skill',
  description: 'Invoke a skill by name',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { name } = paramsSchema.parse(params);

    const userContent = await readUserSkill(name);
    const content = userContent ?? getBuiltinSkill(name)?.content;

    if (content === undefined) {
      return { content: `No skill found: ${name}`, isError: true };
    }

    return {
      content: [{ type: 'text', text: `# Skill: ${name}\n\n${content}` }],
    };
  },
};
