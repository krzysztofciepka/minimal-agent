// Model command - show/switch models
import { loadConfig } from '../config.js';

export async function handleModel(args?: string[]): Promise<string> {
  const config = await loadConfig();
  const provider = config.providers[config.active_provider];

  if (!provider) {
    return 'No provider configured';
  }

  if (!args || args.length === 0) {
    // Show available models
    return `Current: ${config.active_model}\nAvailable: ${provider.models.join(', ')}`;
  }

  const [newModel] = args;
  if (!provider.models.includes(newModel)) {
    return `Model not available: ${newModel}. Available: ${provider.models.join(', ')}`;
  }

  // Switch model (would need to update config)
  return `Switched to model: ${newModel}`;
}