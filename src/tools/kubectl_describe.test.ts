import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { kubectlDescribeTool } from './kubectl_describe.js';

let bin: string;
const origPath = process.env.PATH;

beforeEach(async () => {
  bin = await mkdtemp(join(tmpdir(), 'ma-bin-'));
  await writeFile(join(bin, 'kubectl'), '#!/bin/bash\necho "ARGS:$*"\nexit 0\n');
  await chmod(join(bin, 'kubectl'), 0o755);
  process.env.PATH = bin;
});

afterEach(async () => {
  process.env.PATH = origPath;
  await rm(bin, { recursive: true, force: true });
});

describe('kubectlDescribeTool', () => {
  it('builds describe with namespace', async () => {
    const r = await kubectlDescribeTool.execute({
      resource: 'pod', name: 'svc-abc', namespace: 'prod',
    });
    expect(r.content as string).toContain('ARGS:describe pod svc-abc -n prod');
  });

  it('omits namespace flag when not given', async () => {
    const r = await kubectlDescribeTool.execute({ resource: 'pod', name: 'p1' });
    expect(r.content as string).toContain('ARGS:describe pod p1');
    expect(r.content as string).not.toContain('-n ');
  });
});
