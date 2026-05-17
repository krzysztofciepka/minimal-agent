import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gcloudLoggingTool } from './gcloud_logging.js';

let bin: string;
const origPath = process.env.PATH;

beforeEach(async () => {
  bin = await mkdtemp(join(tmpdir(), 'ma-bin-'));
  // print each arg on its own line so we can assert exact tokens
  await writeFile(join(bin, 'gcloud'), '#!/bin/bash\nfor a in "$@"; do echo "[$a]"; done\nexit 0\n');
  await chmod(join(bin, 'gcloud'), 0o755);
  process.env.PATH = bin;
});

afterEach(async () => {
  process.env.PATH = origPath;
  await rm(bin, { recursive: true, force: true });
});

describe('gcloudLoggingTool', () => {
  it('builds a read query with defaults', async () => {
    const r = await gcloudLoggingTool.execute({
      filter: 'severity>=ERROR', project: 'p',
    });
    const t = r.content as string;
    expect(t).toContain('[logging]');
    expect(t).toContain('[read]');
    expect(t).toContain('[severity>=ERROR]');
    expect(t).toContain('[--project]');
    expect(t).toContain('[p]');
    expect(t).toContain('[--format=json]');
    expect(t).toContain('[--limit]');
    expect(t).toContain('[50]');
    expect(t).toContain('[--freshness]');
    expect(t).toContain('[1h]');
  });

  it('honors explicit limit and freshness', async () => {
    const r = await gcloudLoggingTool.execute({
      filter: 'x', project: 'p', limit: 10, freshness: '30m',
    });
    const t = r.content as string;
    expect(t).toContain('[10]');
    expect(t).toContain('[30m]');
  });
});
