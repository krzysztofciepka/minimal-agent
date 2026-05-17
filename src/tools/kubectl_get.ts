import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  resource: z
    .string()
    .describe('Resource type, e.g. pods, services, deployments'),
  name: z.string().optional().describe('Specific resource name (optional)'),
  namespace: z.string().optional().describe('Namespace (optional)'),
  output: z
    .enum(['wide', 'json'])
    .optional()
    .describe('Output format (default wide)'),
});

export const kubectlGetTool: Tool = {
  name: 'kubectl_get',
  description:
    'List/inspect Kubernetes resources (read-only; wraps `kubectl get`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { resource, name, namespace, output } = paramsSchema.parse(params);
    const args = ['get', resource];
    if (name) args.push(name);
    if (namespace) args.push('-n', namespace);
    args.push('-o', output ?? 'wide');
    const r = await runGcp('kubectl', args);
    return { content: r.message, isError: !r.ok };
  },
};
