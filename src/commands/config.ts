// Config command - open/edit config
import { loadConfig } from '../config.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = join(homedir(), '.minimal-agent.json');

export async function handleConfigCmd(args?: string[]): Promise<string> {
  if (!args || args.length === 0) {
    // Show current config
    try {
      const content = await readFile(CONFIG_PATH, 'utf-8');
      return content;
    } catch {
      return 'Config not found. Create ~/.minimal-agent.json';
    }
  }

  const [action] = args;

  if (action === 'path') {
    return `Config: ${CONFIG_PATH}`;
  }

  return 'Usage: /config [path]';
}