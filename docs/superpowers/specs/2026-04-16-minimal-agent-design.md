# Minimal Coding Agent CLI - Design Spec

## Project Overview

**Product Name:** minimal-agent
**Type:** CLI coding agent with OpenAI-compatible API
**Goal:** Lightweight, open-source coding agent extensible via skills and MCP

---

## Architecture

```
minimal-agent/
├── src/
│   ├── cli.ts              # REPL entry point, TUI
│   ├── client.ts           # OpenAI API client
│   ├── config.ts          # Configuration management
│   ├── tools/            # Tool implementations
│   │   ├── index.ts      # Tool registry
│   │   ├── file_read.ts
│   │   ├── file_write.ts
│   │   ├── file_edit.ts
│   │   ├── bash.ts
│   │   ├── glob.ts
│   │   ├── grep.ts
│   │   ├── web_fetch.ts
│   │   ├── web_search.ts
│   │   ├── ask_user.ts
│   │   ├── tool_search.ts
│   │   ├── skill.ts
│   │   └── mcp.ts
│   ├── commands/          # Slash commands
│   │   ├── index.ts
│   │   ├── help.ts
│   │   ├── clear.ts
│   │   ├── model.ts
│   │   ├── provider.ts
│   │   ├── exit.ts
│   │   ├── mcp.ts
│   │   ├── skills.ts
│   │   └── config.ts
│   ├── skills.ts          # Skills loader (OpenClaude format)
│   ├── mcp/              # MCP client
│   │   └── client.ts
│   └── types.ts          # TypeScript types
├── docs/
│   └── self-configure.md # Self-configuration guide
├── package.json
├── tsconfig.json
└── README.md
```

---

## Tools

### Core Tools (12)

| Tool | File | Description |
|------|------|-------------|
| **file_read** | `tools/file_read.ts` | Read files from filesystem |
| **file_write** | `tools/file_write.ts` | Create/write files |
| **file_edit** | `tools/file_edit.ts` | Edit existing files (find/replace) |
| **bash** | `tools/bash.ts` | Execute shell commands |
| **glob** | `tools/glob.ts` | Find files by pattern |
| **grep** | `tools/grep.ts` | Search file contents |
| **web_fetch** | `tools/web_fetch.ts` | HTTP fetch with HTML→markdown |
| **web_search** | `tools/web_search.ts` | DuckDuckGo search |
| **ask_user** | `tools/ask_user.ts` | Prompt user with choices |
| **tool_search** | `tools/tool_search.ts` | Search available tools |
| **skill** | `tools/skill.ts` | Invoke skills |
| **mcp** | `tools/mcp.ts` | MCP server tools |

### Tool Interface

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}

interface ToolResult {
  content: string | Array<{ type: string; text: string }>;
  isError?: boolean;
}
```

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help message |
| `/clear` | Clear screen |
| `/model` | Show models from active provider, switch model |
| `/provider` | List providers, switch provider |
| `/exit` | Exit the agent |
| `/mcp` | Manage MCP servers |
| `/skills` | List available skills |
| `/config` | Open/edit config |

---

## Configuration

### Config File Location

`~/.minimal-agent.json`

### Config Schema

```typescript
interface Config {
  providers: Record<string, Provider>;
  active_provider: string;
  active_model: string;
  mcp_servers: Record<string, MCPServer>;
}

interface Provider {
  api_url: string;
  api_key: string;
  models: string[];
}

interface MCPServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
}
```

### Example Config

```json
{
  "providers": {
    "openai": {
      "api_url": "https://api.openai.com/v1",
      "api_key": "sk-...",
      "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
    },
    "deepseek": {
      "api_url": "https://api.deepseek.com/v1",
      "api_key": "sk-...",
      "models": ["deepseek-chat"]
    },
    "ollama": {
      "api_url": "http://localhost:11434/v1",
      "api_key": "ollama",
      "models": ["llama3", "mistral", "codellama"]
    }
  },
  "active_provider": "openai",
  "active_model": "gpt-4o",
  "mcp_servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    }
  }
}
```

### Environment Variables (Fallback)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key (if no provider configured) |
| `OPENAI_API_URL` | API URL (default: https://api.openai.com/v1) |
| `OPENAI_MODEL` | Model name (default: gpt-4o) |

---

## Skills System

### Location

Loads skills from `~/.claude/skills/` (OpenClaude compatible)

### Skill Interface

```typescript
interface Skill {
  name: string;
  description: string;
  content: string; // Full skill markdown
}
```

### How Skills Work

1. User invokes `/skill <name>` or tool
2. Agent loads skill from `~/.claude/skills/<name>/`
3. Executes skill instructions
4. Returns results

---

## MCP Integration

### Using @modelcontextprotocol/sdk

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({
  name: 'minimal-agent',
  version: '1.0.0',
}, {
  capabilities: {},
});

// Connect to server
await client.connect({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace']
});

// Call tool
const result = await client.callTool({
  name: 'read_directory',
  arguments: { path: '/workspace' }
});
```

### Config Integration

MCP servers configured in `config.mcp_servers`. Each server:
- Has a name (e.g., "filesystem", "brave-search")
- Specifies `command` + `args` to spawn
- Optionally includes `env` variables

---

## Self-Documentation

### Purpose

The agent should be able to configure itself when asked. Extensive docs enable:

1. **Self-understanding** - Agent knows its own capabilities
2. **Configuration** - Can guide users to set up providers/MCP
3. **Extensibility** - Can explain how to add tools/skills

### Documentation Files

| File | Purpose |
|------|---------|
| `docs/self-configure.md` | How to configure the agent |
| `docs/add-provider.md` | Adding new API providers |
| `docs/add-mcp-server.md` | Adding MCP servers |
| `docs/add-tool.md` | Adding custom tools |
| `docs/add-skill.md` | Creating skills |
| `docs/slash-commands.md` | Slash command reference |

### Self-Configure Doc Example

```markdown
# Self-Configuration Guide

## Quick Start

1. Create config: `~/.minimal-agent.json`
2. Add provider:
   - Get API key from provider
   - Add to config with api_url, api_key, models
3. Start agent: `bun run src/cli.ts`

## Adding Providers

### OpenAI
{
  "providers": {
    "openai": {
      "api_url": "https://api.openai.com/v1",
      "api_key": "sk-your-key",
      "models": ["gpt-4o", "gpt-4o-mini"]
    }
  }
}

### DeepSeek
{
  "providers": {
    "deepseek": {
      "api_url": "https://api.deepseek.com/v1",
      "api_key": "sk-your-key",
      "models": ["deepseek-chat"]
    }
  }
}

### Ollama (local)
{
  "providers": {
    "ollama": {
      "api_url": "http://localhost:11434/v1",
      "api_key": "ollama",
      "models": ["llama3", "mistral"]
    }
  }
}
```

---

## Dependencies

```json
{
  "dependencies": {
    "bun": "^1.0.0",
    "typescript": "^5.3.0",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.22.0",
    "ink": "^4.4.0",
    "react": "^18.2.0"
  }
}
```

---

## Implementation Phases

### Phase 1: Core (MVP)
- [ ] Basic CLI with REPL
- [ ] OpenAI API client
- [ ] Core tools: file_read, file_write, bash, web_fetch
- [ ] Basic slash commands: /help, /clear, /exit

### Phase 2: Standard Tools
- [ ] file_edit, glob, grep, web_search
- [ ] ask_user, tool_search, skill
- [ ] /model, /provider commands

### Phase 3: MCP Integration
- [ ] MCP client setup
- [ ] MCP tool integration
- [ ] /mcp command

### Phase 4: Polish
- [ ] Self-documentation
- [ ] Config management
- [ ] Error handling
- [ ] Testing