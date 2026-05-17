import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  resource: z.string().describe('Resource type, e.g. pod, deployment, service'),
  name: z.string().describe('Resource name'),
  namespace: z.string().optional().describe('Namespace (optional)'),
});

export const kubectlDescribeTool: Tool = {
  name: 'kubectl_describe',
  description:
    'Show detailed state and events for a Kubernetes resource ' +
    '(read-only; wraps `kubectl describe`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { resource, name, namespace } = paramsSchema.parse(params);
    const args = ['describe', resource, name];
    if (namespace) args.push('-n', namespace);
    const r = await runGcp('kubectl', args);
    return { content: r.message, isError: !r.ok };
  },
};
