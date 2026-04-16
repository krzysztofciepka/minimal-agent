// Help command
export function handleHelp(): string {
  return `minimal-agent - CLI coding agent

Usage: bun run src/cli.ts

Slash Commands:
  /help             Show this message
  /clear            Clear screen
  /model [name]     Show/switch models
  /provider [name]  List/switch providers
  /mcp              Manage MCP servers
  /skills           List available skills
  /<skill-name>     Invoke a skill (e.g. /todo-task)
  /config           Show/edit config
  /exit             Exit the agent

Prompt History:
  Up/Down arrow     Navigate previous inputs

Tools Available:
  file_read, file_write, file_edit, bash, glob, grep,
  web_fetch, web_search, ask_user, tool_search, skill, mcp`;
}