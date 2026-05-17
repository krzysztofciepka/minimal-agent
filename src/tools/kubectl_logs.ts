import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  pod: z.string().describe('Pod name'),
  namespace: z.string().optional().describe('Namespace (optional)'),
  container: z.string().optional().describe('Container name (optional)'),
  tail: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Number of trailing lines (default 200)'),
  previous: z
    .boolean()
    .optional()
    .describe('Logs from the previous (crashed) container instance'),
});

export const kubectlLogsTool: Tool = {
  name: 'kubectl_logs',
  description:
    'Fetch logs from a Kubernetes pod (read-only; wraps `kubectl logs`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { pod, namespace, container, tail, previous } =
      paramsSchema.parse(params);
    const args = ['logs', pod];
    if (namespace) args.push('-n', namespace);
    if (container) args.push('--container', container);
    args.push('--tail', String(tail ?? 200));
    if (previous) args.push('--previous');
    const r = await runGcp('kubectl', args);
    return { content: r.message, isError: !r.ok };
  },
};
