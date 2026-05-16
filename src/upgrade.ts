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
