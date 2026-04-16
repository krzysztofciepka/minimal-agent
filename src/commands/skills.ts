// Skills command - list available skills
import { readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export async function handleSkills(): Promise<string> {
  const skillsDir = join(homedir(), '.claude', 'skills');

  try {
    const dirs = await readdir(skillsDir, { withFileTypes: true });
    const skills = dirs.filter(d => d.isDirectory()).map(d => d.name);

    if (skills.length === 0) {
      return 'No skills found in ~/.claude/skills/';
    }

    return `Available skills: ${skills.join(', ')}`;
  } catch {
    return 'No skills found in ~/.claude/skills/';
  }
}