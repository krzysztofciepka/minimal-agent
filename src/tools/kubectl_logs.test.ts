import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { kubectlLogsTool } from './kubectl_logs.js';

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

describe('kubectlLogsTool', () => {
  it('builds logs with all options', async () => {
    const r = await kubectlLogsTool.execute({
      pod: 'svc-abc', namespace: 'prod', container: 'app',
      tail: 200, previous: true,
    });
    expect(r.content as string).toContain(
      'ARGS:logs svc-abc -n prod --container app --tail 200 --previous',
    );
  });

  it('builds minimal logs invocation', async () => {
    const r = await kubectlLogsTool.execute({ pod: 'p1' });
    expect(r.content as string).toContain('ARGS:logs p1 --tail 200');
    expect(r.content as string).not.toContain('--previous');
  });
});
