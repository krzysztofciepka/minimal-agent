import { describe, expect, it } from 'bun:test';
import { assetNameForPlatform, pickAsset, fetchLatestRelease, downloadAsset, installBinary, type Release } from './upgrade.js';
import { createHash } from 'crypto';
import { readFile, mkdtemp, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('assetNameForPlatform', () => {
  it('maps linux x64', () => {
    expect(assetNameForPlatform('linux', 'x64')).toBe('minimal-agent-linux-x64');
  });
  it('maps darwin arm64', () => {
    expect(assetNameForPlatform('darwin', 'arm64')).toBe('minimal-agent-darwin-arm64');
  });
  it('maps win32 x64 with .exe', () => {
    expect(assetNameForPlatform('win32', 'x64')).toBe('minimal-agent-windows-x64.exe');
  });
});

describe('pickAsset', () => {
  const release: Release = {
    tag_name: 'v0.1.3',
    assets: [
      { name: 'minimal-agent-linux-x64', browser_download_url: 'u1', size: 1, digest: 'sha256:a' },
      { name: 'minimal-agent-darwin-arm64', browser_download_url: 'u2', size: 2, digest: 'sha256:b' },
    ],
  };
  it('returns the matching asset', () => {
    expect(pickAsset(release, 'minimal-agent-darwin-arm64').browser_download_url).toBe('u2');
  });
  it('throws a descriptive error when no asset matches', () => {
    expect(() => pickAsset(release, 'minimal-agent-windows-x64.exe')).toThrow(
      'no asset matching minimal-agent-windows-x64.exe in release v0.1.3',
    );
  });
});

function stubFetch(status: number, body: string): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe('fetchLatestRelease', () => {
  it('parses a successful response', async () => {
    const json = JSON.stringify({ tag_name: 'v1.2.3', assets: [] });
    const rel = await fetchLatestRelease('https://api.test', 'dev', stubFetch(200, json));
    expect(rel.tag_name).toBe('v1.2.3');
  });
  it('errors on non-200 with status and snippet', async () => {
    await expect(
      fetchLatestRelease('https://api.test', 'dev', stubFetch(403, 'rate limited')),
    ).rejects.toThrow('failed to fetch latest release: 403: rate limited');
  });
  it('errors on malformed JSON', async () => {
    await expect(
      fetchLatestRelease('https://api.test', 'dev', stubFetch(200, 'not json')),
    ).rejects.toThrow('failed to parse release metadata');
  });
});

function stubDownload(status: number, payload: Uint8Array): typeof fetch {
  return (async () => new Response(status === 200 ? payload : 'nope', { status })) as unknown as typeof fetch;
}

describe('downloadAsset', () => {
  it('writes the payload and verifies a matching digest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ma-dl-'));
    try {
      const payload = new TextEncoder().encode('hello-binary');
      const digest = 'sha256:' + createHash('sha256').update(payload).digest('hex');
      const dst = join(dir, 'out');
      await downloadAsset('http://x/a', dst, digest, 'dev', stubDownload(200, payload));
      expect(new Uint8Array(await readFile(dst))).toEqual(payload);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a non-200 and removes the temp file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ma-dl-'));
    try {
      const dst = join(dir, 'out');
      await expect(
        downloadAsset('http://x/a', dst, 'sha256:zz', 'dev', stubDownload(404, new Uint8Array())),
      ).rejects.toThrow('failed to download http://x/a: 404');
      expect(existsSync(dst)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a digest mismatch and removes the temp file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ma-dl-'));
    try {
      const payload = new TextEncoder().encode('data');
      const dst = join(dir, 'out');
      await expect(
        downloadAsset('http://x/a', dst, 'sha256:deadbeef', 'dev', stubDownload(200, payload)),
      ).rejects.toThrow('checksum mismatch: expected deadbeef, got');
      expect(existsSync(dst)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('installBinary', () => {
  it('replaces target with src and leaves no .old behind', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ma-inst-'));
    try {
      const src = join(dir, 'src');
      const target = join(dir, 'target');
      await writeFile(src, 'NEW');
      await writeFile(target, 'OLD');
      await installBinary(src, target);
      expect(await readFile(target, 'utf-8')).toBe('NEW');
      expect(existsSync(target + '.old')).toBe(false);
      expect(existsSync(src)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rolls back to the original when the second rename fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ma-inst-'));
    try {
      const src = join(dir, 'src');
      const target = join(dir, 'target');
      await writeFile(src, 'NEW');
      await writeFile(target, 'OLD');
      let calls = 0;
      const renameImpl = async (a: string, b: string) => {
        calls += 1;
        if (calls === 2) throw new Error('EACCES: simulated');
        const { rename } = await import('fs/promises');
        await rename(a, b);
      };
      await expect(installBinary(src, target, renameImpl)).rejects.toThrow(
        'failed to install new binary',
      );
      expect(await readFile(target, 'utf-8')).toBe('OLD');
      expect(existsSync(src)).toBe(true);
      expect(existsSync(target + '.old')).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
