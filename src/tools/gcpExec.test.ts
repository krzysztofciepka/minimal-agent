import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { runGcp } from './gcpExec.js';

let bin: string;
const origPath = process.env.PATH;

async function fakeBin(name: string, script: string) {
  const p = join(bin, name);
  await writeFile(p, `#!/bin/bash\n${script}\n`);
  await chmod(p, 0o755);
}

beforeEach(async () => {
  bin = await mkdtemp(join(tmpdir(), 'ma-bin-'));
});

afterEach(async () => {
  process.env.PATH = origPath;
  await rm(bin, { recursive: true, force: true });
});

describe('runGcp', () => {
  it('passes argv through to the binary and returns its output', async () => {
    await fakeBin('gcloud', 'echo "ARGS:$*"; exit 0');
    process.env.PATH = bin;
    const r = await runGcp('gcloud', ['logging', 'read', 'sev>=ERROR']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('ARGS:logging read sev>=ERROR');
  });

  it('maps a missing binary to an install hint', async () => {
    process.env.PATH = bin; // empty dir, no kubectl
    const r = await runGcp('kubectl', ['get', 'pods']);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/kubectl.*not found/i);
    expect(r.message).toContain('kubernetes.io');
  });

  it('maps a kubectl auth/context failure to remediation', async () => {
    await fakeBin('kubectl', 'echo "Unable to connect to the server" 1>&2; exit 1');
    process.env.PATH = bin;
    const r = await runGcp('kubectl', ['get', 'pods']);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/gke_get_credentials|kube context/i);
  });

  it('returns plain output for an unrecognized non-zero exit', async () => {
    await fakeBin('gcloud', 'echo boom 1>&2; exit 2');
    process.env.PATH = bin;
    const r = await runGcp('gcloud', ['logging', 'read']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('boom');
    expect(r.message).toContain('exit code: 2');
  });

  it('reports a timeout instead of succeeding when the process is killed', async () => {
    await fakeBin('gcloud', 'sleep 3; echo done');
    process.env.PATH = bin;
    const r = await runGcp('gcloud', ['logging', 'read'], 300);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/timed out after 300ms/i);
  });

  it('maps a gcloud auth failure to remediation', async () => {
    await fakeBin(
      'gcloud',
      'echo "ERROR: (gcloud.container.clusters.get-credentials) You do not currently have an active account selected." 1>&2; exit 1',
    );
    process.env.PATH = bin;
    const r = await runGcp('gcloud', ['container', 'clusters', 'get-credentials', 'c']);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/gcloud auth login/i);
  });

  it('does not mistake a non-auth gcloud error for an auth failure', async () => {
    await fakeBin('gcloud', 'echo "ERROR: Permission denied while opening file /tmp/x" 1>&2; exit 1');
    process.env.PATH = bin;
    const r = await runGcp('gcloud', ['logging', 'read']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('exit code: 1');
    expect(r.message).not.toMatch(/gcloud auth login/i);
  });
});
