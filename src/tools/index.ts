// Tool registry and interface
import type { Tool } from '../types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { fileReadTool } from './file_read.js';
import { fileWriteTool } from './file_write.js';
import { fileEditTool } from './file_edit.js';
import { bashTool } from './bash.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { webFetchTool } from './web_fetch.js';
import { webSearchTool } from './web_search.js';
import { askUserTool } from './ask_user.js';
import { toolSearchTool } from './tool_search.js';
import { skillTool } from './skill.js';
import { mcpTool } from './mcp.js';

const tools: Tool[] = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  bashTool,
  globTool,
  grepTool,
  webFetchTool,
  webSearchTool,
  askUserTool,
  toolSearchTool,
  skillTool,
  mcpTool,
];

export function getTools(): Tool[] {
  return tools;
}

export function getToolByName(name: string): Tool | undefined {
  return tools.find(t => t.name === name);
}

// Convert tools to OpenAI function calling format
export function getToolsAsFunctions(): Array<{
  type: string;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return tools.map(tool => {
    const schema = zodToJsonSchema(tool.parameters as ZodTypeAny, {
      target: 'openApi3',
      $refStrategy: 'none',
    }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: schema,
      },
    };
  });
}