// Web search tool - DuckDuckGo search
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';

const paramsSchema = z.object({
  query: z.string().describe('Search query'),
});

export const webSearchTool: Tool = {
  name: 'web_search',
  description: 'Search the web using DuckDuckGo',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { query } = paramsSchema.parse(params);

    try {
      // Using HTML search (no API key needed)
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await fetch(url);
      const html = await response.text();

      // Extract search results
      const results = extractSearchResults(html);

      if (results.length === 0) {
        return { content: 'No results found' };
      }

      const output = results
        .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`)
        .join('\n\n');

      return { content: output };
    } catch (error) {
      return {
        content: `Error searching: ${error}`,
        isError: true,
      };
    }
  },
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function extractSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Simple result extraction
  const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
    const url = match[1].replace(/^\//, 'https://duckduckgo.com/');
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    const snippet = match[3].replace(/<[^>]+>/g, '').trim();

    results.push({ title, url, snippet });
  }

  return results;
}