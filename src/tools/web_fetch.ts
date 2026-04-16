// Web fetch tool
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';

const paramsSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
  prompt: z.string().optional().describe('Prompt to extract specific information'),
});

export const webFetchTool: Tool = {
  name: 'web_fetch',
  description: 'Fetch a URL and convert HTML to markdown',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { url } = paramsSchema.parse(params);

    try {
      const response = await fetch(url);
      const html = await response.text();

      // Simple HTML to markdown conversion
      const markdown = htmlToMarkdown(html);

      return { content: markdown };
    } catch (error) {
      return {
        content: `Error fetching URL: ${error}`,
        isError: true,
      };
    }
  },
};

function htmlToMarkdown(html: string): string {
  // Basic HTML stripping - remove scripts, styles, and convert common tags
  let result = html;

  // Remove script and style tags
  result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert headers
  result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
  result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
  result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');

  // Convert paragraphs and divs
  result = result.replace(/<(p|div)[^>]*>([\s\S]*?)<\/\1>/gi, '$2\n\n');

  // Convert links
  result = result.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Convert code blocks
  result = result.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n');
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Strip remaining tags
  result = result.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  result = result
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  // Clean up whitespace
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}