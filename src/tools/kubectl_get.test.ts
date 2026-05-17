import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { kubectlGetTool } from './kubectl_get.js';

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

describe('kubectlGetTool', () => {
  it('builds get with name, namespace and json output', async () => {
    const r = await kubectlGetTool.execute({
      resource: 'pods', name: 'svc-abc', namespace: 'prod', output: 'json',
    });
    expect(r.content as string).toContain(
      'ARGS:get pods svc-abc -n prod -o json',
    );
  });

  it('defaults output to wide and omits name when not given', async () => {
    const r = await kubectlGetTool.execute({ resource: 'services' });
    expect(r.content as string).toContain('ARGS:get services -o wide');
  });
});
