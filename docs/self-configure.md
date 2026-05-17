# Self-Configuration Guide

## Quick Start

1. Create config file:
```bash
touch ~/.minimal-agent.json
```

2. Add provider:
   - Get API key from your provider
   - Add to config with api_url, api_key, models
3. Start agent:
```bash
bun run src/cli.ts
```

## Adding Providers

### OpenAI
```json
{
  "providers": {
    "openai": {
      "api_url": "https://api.openai.com/v1",
      "api_key": "sk-your-key",
      "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
    }
  }
}
```

### DeepSeek
```json
{
  "providers": {
    "deepseek": {
      "api_url": "https://api.deepseek.com/v1",
      "api_key": "sk-your-key",
      "models": ["deepseek-chat"]
    }
  }
}
```

### Ollama (local)
```json
{
  "providers": {
    "ollama": {
      "api_url": "http://localhost:11434/v1",
      "api_key": "ollama",
      "models": ["llama3", "mistral", "codellama"]
    }
  }
}
```

### LM Studio
```json
{
  "providers": {
    "lmstudio": {
      "api_url": "http://localhost:1234/v1",
      "api_key": "not-required",
      "models": ["llama3", "mistral"]
    }
  }
}
```

## Environment Variables (Fallback)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key (if no provider configured) |
| `OPENAI_API_URL` | API URL (default: https://api.openai.com/v1) |
| `OPENAI_MODEL` | Model name (default: gpt-4o) |

## Full Config Example

```json
{
  "providers": {
    "openai": {
      "api_url": "https://api.openai.com/v1",
      "api_key": "sk-...",
      "models": ["gpt-4o", "gpt-4o-mini"]
    },
    "deepseek": {
      "api_url": "https://api.deepseek.com/v1",
      "api_key": "sk-...",
      "models": ["deepseek-chat"]
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

## Adding MCP Servers

See [Adding MCP Servers](./add-mcp-server.md) for detailed instructions.

## Adding Custom Tools

See [Adding Custom Tools](./add-tool.md) for detailed instructions.

## Built-in debugging skills

`minimal-agent` ships two built-in skills (invoke via the `skill` tool, or
list them with the `/skills` command). A file of the same name under
`~/.claude/skills/<name>/` overrides the built-in.

- **gke-service-debug** — debug a GKE service. Reads env vars `GKE_PROJECT`,
  `GKE_CLUSTER`, `GKE_LOCATION`, optional `SERVICE_REPO_PATH`, and optional
  MySQL vars; asks interactively when unset. Uses ambient `gcloud`/`kubectl`
  auth.
- **transaction-flow-debug** — investigate a failed transaction by
  `transaction_id`. Reads `MYSQL_DSN` (or `MYSQL_HOST`/`MYSQL_PORT`/
  `MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE`); read-only queries only.

Both rely on `gcloud`/`kubectl`/`mysql` being installed and authenticated;
missing tools or credentials produce an actionable error.