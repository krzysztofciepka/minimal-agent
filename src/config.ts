// Configuration management for minimal-agent
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Config, Provider } from './types.js';

const CONFIG_PATH = join(homedir(), '.minimal-agent.json');

export function getDefaultConfig(): Config {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const apiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const providers: Record<string, Provider> = {};

  if (apiKey) {
    providers.openai = {
      api_url: apiUrl,
      api_key: apiKey,
      models: [model],
    };
  }

  return {
    providers,
    active_provider: 'openai',
    active_model: model,
    mcp_servers: {},
  };
}

export async function loadConfig(): Promise<Config> {
  if (!existsSync(CONFIG_PATH)) {
    const defaultConfig = getDefaultConfig();
    // Don't write default config - let user configure
    return defaultConfig;
  }

  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(content) as Config;
  } catch {
    return getDefaultConfig();
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const updated = { ...current, ...updates };
  await saveConfig(updated);
  return updated;
}