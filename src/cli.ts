// Main REPL entry point for minimal-agent
import { apiClient } from './client.js';
import { loadConfig } from './config.js';
import { getTools } from './tools/index.js';
import type { Message } from './types.js';

const HELP = `minimal-agent - CLI coding agent

Usage: bun run src/cli.ts

Commands:
  /help - Show this message
  /clear - Clear screen
  /exit - Exit the agent

Type your request and press Enter to start.`;

let messages: Message[] = [];
let running = true;

async function buildContext(userMessage: string): Promise<string> {
  try {
    const { readFile } = await import('fs/promises');
    const { homedir } = await import('os');

    const claudeMdPath = `${homedir()}/CLAUDE.md`;
    const agentsMdPath = `${homedir()}/AGENTS.md`;

    let claudeMd = '';
    let agentsMd = '';

    try {
      claudeMd = await readFile(claudeMdPath, 'utf-8');
    } catch {}

    try {
      agentsMd = await readFile(agentsMdPath, 'utf-8');
    } catch {}

    const parts = [];
    if (claudeMd) parts.push(`# CLAUDE.md\n${claudeMd}`);
    if (agentsMd) parts.push(`# AGENTS.md\n${agentsMd}`);
    parts.push(userMessage);

    return parts.filter(Boolean).join('\n\n---\n\n');
  } catch {
    return userMessage;
  }
}

async function handleSlashCommand(input: string): Promise<boolean> {
  const [cmd, ...args] = input.slice(1).split(' ');

  switch (cmd) {
    case 'help':
      console.log(HELP);
      return true;
    case 'clear':
      console.clear();
      return true;
    case 'exit':
      running = false;
      return true;
    default:
      return false;
  }
}

async function runLoop(): Promise<void> {
  await apiClient.init();
  const config = await loadConfig();
  const tools = getTools();

  console.log('minimal-agent ready');
  console.log(`Provider: ${config.active_provider} | Model: ${config.active_model}`);
  console.log(`Tools: ${tools.map(t => t.name).join(', ')}`);
  console.log('');

  while (running) {
    const input = await readline('> ');
    if (!input.trim()) continue;

    // Check for slash commands
    if (input.startsWith('/')) {
      const handled = await handleSlashCommand(input);
      if (handled) continue;
      console.log('Unknown command. Type /help for available commands.');
      continue;
    }

    // Build context with CLAUDE.md and AGENTS.md
    const contextMessage = await buildContext(input);

    messages.push({ role: 'user', content: contextMessage });

    try {
      const response = await apiClient.chatWithTools(messages, tools as unknown[]);

      if (response.toolResults.length > 0) {
        // Handle tool execution here (placeholder for now)
        console.log('Tool results:', response.toolResults);
      }

      console.log(response.message.content);
      messages.push(response.message);
    } catch (err) {
      console.error('Error:', err);
      messages.pop(); // Remove failed user message
    }
  }
}

// Readline for Bun/Node
async function readline(prompt: string): Promise<string> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}

runLoop().catch(console.error);