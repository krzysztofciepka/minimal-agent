// Skills command - list available skills (user + built-in)
import { readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { BUILTIN_SKILLS } from '../skills/index.js';

export async function handleSkills(): Promise<string> {
  const skillsDir = join(process.env.HOME ?? homedir(), '.claude', 'skills');

  let userSkills: string[] = [];
  try {
    const dirs = await readdir(skillsDir, { withFileTypes: true });
    userSkills = dirs.filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    userSkills = [];
  }

  const userSet = new Set(userSkills);
  const builtinOnly = BUILTIN_SKILLS
    .map(s => s.name)
    .filter(n => !userSet.has(n));

  const lines = [
    ...userSkills.map(n => `  ${n}`),
    ...builtinOnly.map(n => `  ${n} (built-in)`),
  ];

  if (lines.length === 0) return 'No skills found.';
  return `Available skills:\n${lines.join('\n')}`;
}
