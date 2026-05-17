import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  filter: z.string().describe('Cloud Logging filter expression'),
  project: z.string().describe('GCP project id'),
  limit: z.number().int().positive().optional().describe('Max entries (default 50)'),
  freshness: z
    .string()
    .optional()
    .describe('Only entries newer than this, e.g. 1h, 30m, 2d (default 1h)'),
});

export const gcloudLoggingTool: Tool = {
  name: 'gcloud_logging',
  description:
    'Read entries from GCP Cloud Logging (read-only; wraps ' +
    '`gcloud logging read --format=json`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { filter, project, limit, freshness } = paramsSchema.parse(params);
    const r = await runGcp('gcloud', [
      'logging', 'read', filter,
      '--project', project,
      '--format=json',
      '--limit', String(limit ?? 50),
      '--freshness', freshness ?? '1h',
    ]);
    return { content: r.message, isError: !r.ok };
  },
};
