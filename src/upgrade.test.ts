import { describe, expect, it } from 'bun:test';
import { assetNameForPlatform, pickAsset, type Release } from './upgrade.js';

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
