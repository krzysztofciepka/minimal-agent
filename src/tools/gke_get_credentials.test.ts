import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gkeGetCredentialsTool } from './gke_get_credentials.js';

let bin: string;
const origPath = process.env.PATH;

beforeEach(async () => {
  bin = await mkdtemp(join(tmpdir(), 'ma-bin-'));
  await writeFile(join(bin, 'gcloud'), '#!/bin/bash\necho "ARGS:$*"\nexit 0\n');
  await chmod(join(bin, 'gcloud'), 0o755);
  process.env.PATH = bin;
});

afterEach(async () => {
  process.env.PATH = origPath;
  await rm(bin, { recursive: true, force: true });
});

describe('gkeGetCredentialsTool', () => {
  it('builds the correct gcloud argv', async () => {
    const r = await gkeGetCredentialsTool.execute({
      cluster: 'prod', project: 'my-proj', location: 'us-central1',
    });
    expect(r.isError).toBeFalsy();
    const text = r.content as string;
    expect(text).toContain('container clusters get-credentials prod');
    expect(text).toContain('--project my-proj');
    expect(text).toContain('--region us-central1');
  });

  it('uses --zone for a zonal location', async () => {
    const r = await gkeGetCredentialsTool.execute({
      cluster: 'prod', project: 'p', location: 'us-central1-a',
    });
    expect(r.content as string).toContain('--zone us-central1-a');
  });
});
