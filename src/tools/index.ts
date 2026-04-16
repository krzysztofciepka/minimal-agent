// Tool registry and interface
import type { Tool } from '../types.js';
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