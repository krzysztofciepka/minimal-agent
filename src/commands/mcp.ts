// MCP command - manage MCP servers
import { loadConfig } from '../config.js';

export async function handleMcp(args?: string[]): Promise<string> {
  const config = await loadConfig();
  const servers = Object.keys(config.mcp_servers);

  if (!args || args.length === 0) {
    // List servers
    if (servers.length === 0) {
      return 'No MCP servers configured. Add to ~/.minimal-agent.json';
    }
    return `Configured: ${servers.join(', ')}`;
  }

  const [action, name] = args;

  if (action === 'list') {
    return `Configured: ${servers.join(', ')}`;
  }

  if (action === 'start' && name) {
    const server = config.mcp_servers[name];
    if (!server) {
      return `Server not found: ${name}`;
    }
    return `Would start: ${server.command} ${server.args.join(' ')}`;
  }

  return 'Usage: /mcp [list|start <name>]';
}