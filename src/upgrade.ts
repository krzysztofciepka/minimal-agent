// Self-upgrade: fetch the latest GitHub release and atomically replace the
// running binary. Pure functions take injectable fetch/rename for testing.
import { createHash } from 'crypto';
import { realpathSync } from 'fs';
import { open, rename, unlink, chmod } from 'fs/promises';
import { dirname, join } from 'path';

export const REPO_OWNER = 'krzysztofciepka';
export const REPO_NAME = 'minimal-agent';

export interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
  digest: string;
}

export interface Release {
  tag_name: string;
  assets: Asset[];
}

export type FetchImpl = typeof fetch;

export function assetNameForPlatform(platform: string, arch: string): string {
  const os = platform === 'win32' ? 'windows' : platform;
  const normalizedArch = arch === 'arm64' ? 'arm64' : 'x64';
  const ext = os === 'windows' ? '.exe' : '';
  return `minimal-agent-${os}-${normalizedArch}${ext}`;
}

export function pickAsset(release: Release, assetName: string): Asset {
  const found = release.assets.find((asset) => asset.name === assetName);
  if (!found) {
    throw new Error(
      `no asset matching ${assetName} in release ${release.tag_name}`,
    );
  }
  return found;
}

const UA_PREFIX = 'minimal-agent-upgrader/';

function snippet(s: string): string {
  return s.length > 200 ? s.slice(0, 200) + '...' : s;
}

export async function fetchLatestRelease(
  apiBaseUrl: string,
  version: string,
  fetchImpl: FetchImpl = fetch,
): Promise<Release> {
  const url = `${apiBaseUrl}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
  const resp = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': UA_PREFIX + version,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(
      `failed to fetch latest release: ${resp.status}: ${snippet(body)}`,
    );
  }
  try {
    return JSON.parse(body) as Release;
  } catch (err: any) {
    throw new Error(
      `failed to parse release metadata: ${err?.message ?? err}`,
    );
  }
}

export async function downloadAsset(
  url: string,
  dstPath: string,
  expectedDigest: string,
  version: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const resp = await fetchImpl(url, {
      headers: { 'User-Agent': UA_PREFIX + version },
      signal: AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      throw new Error(`failed to download ${url}: ${resp.status}`);
    }
    if (!resp.body) {
      throw new Error(`download interrupted: empty response body`);
    }
    const hash = createHash('sha256');
    handle = await open(dstPath, 'w', 0o755);
    reader = resp.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      await handle.write(value);
    }
    await handle.close();
    handle = undefined;

    const got = hash.digest('hex');
    const want = expectedDigest.replace(/^sha256:/, '');
    if (got !== want) {
      throw new Error(`checksum mismatch: expected ${want}, got ${got}`);
    }
    await chmod(dstPath, 0o755);
  } catch (err) {
    if (reader) await reader.cancel().catch(() => {});
    if (handle) await handle.close().catch(() => {});
    await unlink(dstPath).catch(() => {});
    throw err;
  }
}
