// Main REPL entry point for minimal-agent
import { apiClient } from './client.js';
import type { ChatResult } from './client.js';
import { loadConfig } from './config.js';
import { getTools } from './tools/index.js';
import type { Message, Config } from './types.js';
import { startTUI } from './tui.js';
import { VERSION } from './version.js';
import { runUpgrade } from './upgrade.js';

// ANSI colors
const RESET = '\x1b[0m';
const LIGHT_BLUE = '\x1b[36;1m';
const CYAN = '\x1b[36m';

const HELP = `minimal-agent - CLI coding agent

Usage: minimal-agent [--no-tui] [--version] [--upgrade]

The TUI is launched by default. Pass --no-tui (alias: --repl) for this
plain REPL.

Commands:
  /help - Show this message
  /clear - Clear screen
  /exit - Exit the agent

Type your request and press Enter to start.`;

const SEPARATOR = '─'.repeat(process.stdout.columns || 60);

let messages: Message[] = [];
let running = true;
let config: Config | null = null;

function getStatusLine(): string {
  if (!config) return '';
  return CYAN + config.active_model + RESET + ' | ' + config.active_provider;
}

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

/**
 * Format the result of an agentic tool-use turn into printable lines.
 * Mirrors the TUI (REPL.tsx) semantics: surface each tool execution, then
 * the assistant's final message.
 */
export function formatChatResult(result: ChatResult): string[] {
  const lines: string[] = [];

  for (const exec of result.toolExecutions) {
    const preview =
      exec.args.length > 120 ? exec.args.slice(0, 117) + '...' : exec.args;
    lines.push(
      `⚙  ${exec.name}(${preview})${exec.result.isError ? ' — error' : ''}`,
    );
  }

  const content =
    typeof result.message.content === 'string'
      ? result.message.content
      : JSON.stringify(result.message.content);
  lines.push(content || '(no content)');
  return lines;
}

async function runLoop(): Promise<void> {
  await apiClient.init();
  config = await loadConfig();
  const tools = getTools();

  console.clear();
  console.log('minimal-agent ready');
  console.log(`Provider: ${config.active_provider} | Model: ${config.active_model}`);
  console.log(`Tools: ${tools.map(t => t.name).join(', ')}`);
  console.log('');

  while (running) {
    // Print separator above prompt
    console.log(SEPARATOR);

    // Print prompt (light blue)
    process.stdout.write(LIGHT_BLUE + '> ' + RESET);
    const input = await readline('');
    if (!input.trim()) continue;

    // Print separator below prompt
    console.log(SEPARATOR);

    // Check for slash commands
    if (input.startsWith('/')) {
      const handled = await handleSlashCommand(input);
      if (handled) {
        console.log(getStatusLine());
        console.log(SEPARATOR);
        continue;
      }
      console.log('Unknown command. Type /help for available commands.');
      console.log(getStatusLine());
      console.log(SEPARATOR);
      continue;
    }

    // Build context with CLAUDE.md and AGENTS.md
    const contextMessage = await buildContext(input);

    messages.push({ role: 'user', content: contextMessage });

    try {
      const response = await apiClient.chatWithTools(messages);

      for (const line of formatChatResult(response)) {
        console.log(line);
      }
      // Carry the full updated history forward (assistant + tool turns),
      // matching the TUI path.
      messages = response.messages;

      // Print status at bottom
      console.log(getStatusLine());
    } catch (err) {
      console.error('Error:', err);
      messages.pop();
      console.log(getStatusLine());
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

// The TUI is the default experience. Pass --no-tui (alias: --repl) to use
// the plain non-TUI REPL. --tui is still accepted for backward compatibility.
const wantsPlainRepl =
  process.argv.includes('--no-tui') || process.argv.includes('--repl');
const isTUI = !wantsPlainRepl;

if (import.meta.main) {
  if (process.argv.includes('--version')) {
    console.log(`minimal-agent ${VERSION}`);
    process.exit(0);
  } else if (process.argv.includes('--upgrade')) {
    runUpgrade(process.stderr, { currentVersion: VERSION })
      .then(() => process.exit(0))
      .catch((err: any) => {
        console.error(String(err?.message ?? err));
        process.exit(1);
      });
  } else if (isTUI) {
    startTUI().catch(console.error);
  } else {
    runLoop().catch(console.error);
  }
}