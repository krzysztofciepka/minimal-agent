import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  cluster: z.string().describe('GKE cluster name'),
  project: z.string().describe('GCP project id'),
  location: z
    .string()
    .describe('Cluster region (e.g. us-central1) or zone (e.g. us-central1-a)'),
});

// A zone has three dash-separated segments (region + zone suffix).
function isZone(location: string): boolean {
  return location.split('-').length >= 3;
}

export const gkeGetCredentialsTool: Tool = {
  name: 'gke_get_credentials',
  description:
    'Fetch GKE cluster credentials and set the kube context ' +
    '(read-only; wraps `gcloud container clusters get-credentials`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { cluster, project, location } = paramsSchema.parse(params);
    const locFlag = isZone(location) ? '--zone' : '--region';
    const r = await runGcp('gcloud', [
      'container', 'clusters', 'get-credentials', cluster,
      '--project', project,
      locFlag, location,
    ]);
    return { content: r.message, isError: !r.ok };
  },
};
