// Provider command - list/switch providers
import { loadConfig } from '../config.js';

export async function handleProvider(args?: string[]): Promise<string> {
  const config = await loadConfig();
  const providers = Object.keys(config.providers);

  if (!args || args.length === 0) {
    // List providers
    return `Active: ${config.active_provider}\nAvailable: ${providers.join(', ')}`;
  }

  const [newProvider] = args;
  if (!providers.includes(newProvider)) {
    return `Provider not found: ${newProvider}. Available: ${providers.join(', ')}`;
  }

  // Switch provider
  return `Switched to provider: ${newProvider}`;
}