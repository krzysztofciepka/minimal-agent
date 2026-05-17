import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleSkills } from './skills.js';

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

describe('handleSkills', () => {
  it('lists built-ins even with no user skills dir', async () => {
    const out = await handleSkills();
    expect(out).toContain('gke-service-debug');
    expect(out).toContain('transaction-flow-debug');
    expect(out).toContain('built-in');
  });

  it('lists user skills and dedupes same-named built-ins', async () => {
    const dir = join(home, '.claude', 'skills', 'gke-service-debug');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), 'x');
    const myDir = join(home, '.claude', 'skills', 'my-skill');
    await mkdir(myDir, { recursive: true });
    await writeFile(join(myDir, 'SKILL.md'), 'y');

    const out = await handleSkills();
    expect(out).toContain('my-skill');
    // gke-service-debug appears once (user copy wins, not also as built-in)
    expect(out.match(/gke-service-debug/g)?.length).toBe(1);
    expect(out).toContain('transaction-flow-debug (built-in)');
  });
});
