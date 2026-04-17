// Web search tool — Brave Search API
// https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
//
// API key resolution (first match wins):
//   1. BRAVE_SEARCH_API_KEY env var
//   2. BRAVE_API_KEY env var
//   3. ~/.minimal-agent.json -> brave_search.api_key

import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { z } from 'zod'
import type { Tool, ToolResult } from '../types.js'

const paramsSchema = z.object({
  query: z.string().min(1).describe('Search query'),
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Max results (default 10)'),
  country: z
    .string()
    .optional()
    .describe('2-letter country code (e.g. "US", "PL")'),
})

const CONFIG_PATH = join(homedir(), '.minimal-agent.json')
const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search'

async function resolveApiKey(): Promise<string | null> {
  if (process.env.BRAVE_SEARCH_API_KEY) return process.env.BRAVE_SEARCH_API_KEY
  if (process.env.BRAVE_API_KEY) return process.env.BRAVE_API_KEY
  try {
    const cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as {
      brave_search?: { api_key?: string }
    }
    return cfg.brave_search?.api_key ?? null
  } catch {
    return null
  }
}

interface BraveSearchResponse {
  web?: {
    results?: Array<{
      title?: string
      url?: string
      description?: string
      age?: string
    }>
  }
}

export const webSearchTool: Tool = {
  name: 'web_search',
  description:
    'Search the web using Brave Search API. Returns title, URL, and description for each result.',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { query, count = 10, country } = paramsSchema.parse(params)

    const apiKey = await resolveApiKey()
    if (!apiKey) {
      return {
        content:
          'Brave Search API key not configured. Set BRAVE_SEARCH_API_KEY env var ' +
          'or add { "brave_search": { "api_key": "..." } } to ~/.minimal-agent.json',
        isError: true,
      }
    }

    const url = new URL(BRAVE_URL)
    url.searchParams.set('q', query)
    url.searchParams.set('count', String(count))
    if (country) url.searchParams.set('country', country)

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      })

      if (!response.ok) {
        const text = await response.text()
        return {
          content: `Brave Search API error ${response.status}: ${text}`,
          isError: true,
        }
      }

      const data = (await response.json()) as BraveSearchResponse
      const results = data.web?.results ?? []

      if (results.length === 0) {
        return { content: 'No results found' }
      }

      const formatted = results
        .slice(0, count)
        .map((r, i) => {
          const title = r.title ?? '(no title)'
          const snippet = (r.description ?? '').replace(/<[^>]+>/g, '')
          const age = r.age ? ` — ${r.age}` : ''
          return `${i + 1}. ${title}${age}\n   ${r.url ?? ''}\n   ${snippet}`
        })
        .join('\n\n')

      return { content: formatted }
    } catch (error: any) {
      return {
        content: `Error searching: ${error?.message ?? String(error)}`,
        isError: true,
      }
    }
  },
}
