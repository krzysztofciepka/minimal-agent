// Help command
export function handleHelp(): string {
  return `minimal-agent - CLI coding agent

Usage: bun run src/cli.ts

Slash Commands:
  /help   - Show this message
  /clear  - Clear screen
  /model  - Show/switch models
  /provider - List/switch providers
  /exit   - Exit the agent
  /mcp    - Manage MCP servers
  /skills - List available skills
  /config - Open/edit config

Tools Available:
  file_read, file_write, file_edit, bash, glob, grep,
  web_fetch, web_search, ask_user, tool_search, skill, mcp`;
}