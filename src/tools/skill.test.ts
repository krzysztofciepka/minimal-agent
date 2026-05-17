import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { skillTool } from './skill.js';

let home: string;
const origHome = process.env.HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ma-home-'));
  process.env.HOME = home;
});

afterEach(async () => {
  process.env.HOME = origHome;
  await rm(home, { recursive: true, force: true });
});

function text(r: Awaited<ReturnType<typeof skillTool.execute>>): string {
  return typeof r.content === 'string'
    ? r.content
    : r.content.map(c => c.text).join('');
}

describe('skillTool', () => {
  it('falls back to a built-in skill when no user file exists', async () => {
    const r = await skillTool.execute({ name: 'gke-service-debug' });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('gke-service-debug');
  });

  it('prefers a user skill file over a built-in of the same name', async () => {
    const dir = join(home, '.claude', 'skills', 'gke-service-debug');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), 'USER OVERRIDE CONTENT');
    const r = await skillTool.execute({ name: 'gke-service-debug' });
    expect(text(r)).toContain('USER OVERRIDE CONTENT');
    expect(text(r)).not.toContain('## Step 1 — Resolve environment');
  });

  it('errors on an unknown skill', async () => {
    const r = await skillTool.execute({ name: 'does-not-exist' });
    expect(r.isError).toBe(true);
  });
});
