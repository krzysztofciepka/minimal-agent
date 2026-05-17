import { describe, expect, it } from 'bun:test';
import { getToolByName, getTools } from './index.js';

describe('tool registry', () => {
  it('registers the GCP debug tools', () => {
    for (const n of [
      'gke_get_credentials',
      'gcloud_logging',
      'kubectl_get',
      'kubectl_describe',
      'kubectl_logs',
    ]) {
      expect(getToolByName(n)?.name).toBe(n);
    }
  });

  it('still registers the core tools', () => {
    const names = getTools().map(t => t.name);
    expect(names).toContain('bash');
    expect(names).toContain('skill');
  });
});
