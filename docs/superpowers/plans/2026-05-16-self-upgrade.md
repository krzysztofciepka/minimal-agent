# minimal-agent Self-Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `minimal-agent --version` and `minimal-agent --upgrade` so an installed binary can print its embedded version and self-update from GitHub Releases.

**Architecture:** A single `src/upgrade.ts` module with pure, injectable functions (fetch/rename stubbable) plus a `src/version.ts` constant rewritten at release build time. `src/cli.ts` gets a flag prologue that handles `--version`/`--upgrade` before any TUI/REPL bootstrap. Atomic two-rename install avoids the `ETXTBSY` busy-binary problem.

**Tech Stack:** TypeScript, Bun (`bun test`, `bun build --compile`), Node stdlib (`crypto`, `fs`, `fs/promises`, `path`), global `fetch`.

Spec: `docs/superpowers/specs/2026-05-16-self-upgrade-design.md`

---

## File Structure

- **Create** `src/version.ts` — single exported `VERSION` constant, default `'dev'`.
- **Create** `src/version.test.ts` — asserts the default.
- **Create** `src/upgrade.ts` — entire upgrade feature (asset resolution, fetch, download+verify, atomic install, orchestrator).
- **Create** `src/upgrade.test.ts` — hermetic unit tests (stub `fetch`, `os.tmpdir()` dirs).
- **Modify** `src/cli.ts` — add `--version`/`--upgrade` prologue inside the existing `if (import.meta.main)` block.
- **Modify** `scripts/build.ts` — rewrite `src/version.ts` to the release tag around the build, restore in `finally`.

---

### Task 1: Version module + `--version` flag + build embedding

**Files:**
- Create: `src/version.ts`
- Test: `src/version.test.ts`
- Modify: `src/cli.ts` (the `if (import.meta.main)` block, currently lines ~190-200)
- Modify: `scripts/build.ts`

- [ ] **Step 1: Write the failing test**

Create `src/version.test.ts`:

```ts
import { expect, it } from 'bun:test';
import { VERSION } from './version.js';

it('defaults to dev for unversioned builds', () => {
  expect(VERSION).toBe('dev');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/version.test.ts`
Expected: FAIL — cannot resolve `./version.js` (module does not exist).

- [ ] **Step 3: Create the version module**

Create `src/version.ts`:

```ts
// Overwritten with the release tag by scripts/build.ts at release build time.
// Stays 'dev' for local `bun run` / `bun run build` without MINIMAL_AGENT_VERSION.
export const VERSION = 'dev';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/version.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Wire `--version` into cli.ts**

In `src/cli.ts`, add to the import block near the top (after the existing `import { startTUI } from './tui.js';`):

```ts
import { VERSION } from './version.js';
```

Then replace the entire trailing `if (import.meta.main)` block:

```ts
if (import.meta.main) {
  if (isTUI) {
    startTUI().catch(console.error);
  } else {
    runLoop().catch(console.error);
  }
}
```

with:

```ts
if (import.meta.main) {
  if (process.argv.includes('--version')) {
    console.log(`minimal-agent ${VERSION}`);
    process.exit(0);
  } else if (isTUI) {
    startTUI().catch(console.error);
  } else {
    runLoop().catch(console.error);
  }
}
```

- [ ] **Step 6: Manually verify `--version`**

Run: `bun run src/cli.ts --version`
Expected output exactly: `minimal-agent dev`

- [ ] **Step 7: Add release version embedding to build.ts**

In `scripts/build.ts`, add to the imports at the top:

```ts
import { readFile, writeFile } from 'fs/promises'
```

(If `mkdir, rm` are already imported from `fs/promises`, extend that existing import instead of adding a duplicate line: `import { mkdir, rm, readFile, writeFile } from 'fs/promises'`.)

In `main()`, wrap the existing target build loop. Find:

```ts
  console.log(`Building ${targets.length} target(s) into ./${outDir}/`)
  const start = Date.now()

  for (const target of targets) {
    try {
      await build(target, outDir)
    } catch (err: any) {
      console.error(`    ✗ ${target.name} failed: ${err?.message ?? err}`)
      process.exitCode = 1
    }
  }
```

Replace with:

```ts
  console.log(`Building ${targets.length} target(s) into ./${outDir}/`)
  const start = Date.now()

  const VERSION_FILE = 'src/version.ts'
  const tag = process.env.MINIMAL_AGENT_VERSION
  const originalVersionFile = await readFile(VERSION_FILE, 'utf-8')
  if (tag) {
    await writeFile(
      VERSION_FILE,
      `// Overwritten with the release tag by scripts/build.ts at release build time.\n` +
        `// Stays 'dev' for local \`bun run\` / \`bun run build\` without MINIMAL_AGENT_VERSION.\n` +
        `export const VERSION = '${tag}';\n`,
    )
    console.log(`  embedding version ${tag}`)
  }

  try {
    for (const target of targets) {
      try {
        await build(target, outDir)
      } catch (err: any) {
        console.error(`    ✗ ${target.name} failed: ${err?.message ?? err}`)
        process.exitCode = 1
      }
    }
  } finally {
    await writeFile(VERSION_FILE, originalVersionFile)
  }
```

- [ ] **Step 8: Verify the build embedding + restore**

Run: `MINIMAL_AGENT_VERSION=v9.9.9 bun run build && ./dist/minimal-agent-linux-x64 --version`
Expected: `minimal-agent v9.9.9`

Run: `git diff --stat src/version.ts`
Expected: no output (file restored to `'dev'` by the `finally` block).

- [ ] **Step 9: Commit**

```bash
git add src/version.ts src/version.test.ts src/cli.ts scripts/build.ts
git commit -m "feat(cli): --version flag with build-time version embedding"
```

---

### Task 2: `assetNameForPlatform` and `pickAsset`

**Files:**
- Create: `src/upgrade.ts`
- Test: `src/upgrade.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/upgrade.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/upgrade.test.ts`
Expected: FAIL — cannot resolve `./upgrade.js`.

- [ ] **Step 3: Create upgrade.ts with the two functions + types**

Create `src/upgrade.ts`:

```ts
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
  const a = arch === 'arm64' ? 'arm64' : 'x64';
  const ext = os === 'windows' ? '.exe' : '';
  return `minimal-agent-${os}-${a}${ext}`;
}

export function pickAsset(release: Release, assetName: string): Asset {
  const found = release.assets.find((x) => x.name === assetName);
  if (!found) {
    throw new Error(
      `no asset matching ${assetName} in release ${release.tag_name}`,
    );
  }
  return found;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/upgrade.test.ts`
Expected: PASS (5 pass).

- [ ] **Step 5: Commit**

```bash
git add src/upgrade.ts src/upgrade.test.ts
git commit -m "feat(upgrade): asset name resolution + pickAsset"
```

---

### Task 3: `fetchLatestRelease`

**Files:**
- Modify: `src/upgrade.ts`
- Test: `src/upgrade.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/upgrade.test.ts`:

```ts
import { fetchLatestRelease } from './upgrade.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/upgrade.test.ts`
Expected: FAIL — `fetchLatestRelease` is not exported.

- [ ] **Step 3: Implement `fetchLatestRelease`**

Append to `src/upgrade.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/upgrade.test.ts`
Expected: PASS (8 pass).

- [ ] **Step 5: Commit**

```bash
git add src/upgrade.ts src/upgrade.test.ts
git commit -m "feat(upgrade): fetchLatestRelease"
```

---

### Task 4: `downloadAsset` (stream + sha256 verify)

**Files:**
- Modify: `src/upgrade.ts`
- Test: `src/upgrade.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/upgrade.test.ts`:

```ts
import { downloadAsset } from './upgrade.js';
import { createHash } from 'crypto';
import { readFile, mkdtemp, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/upgrade.test.ts`
Expected: FAIL — `downloadAsset` is not exported.

- [ ] **Step 3: Implement `downloadAsset`**

Append to `src/upgrade.ts`:

```ts
export async function downloadAsset(
  url: string,
  dstPath: string,
  expectedDigest: string,
  version: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
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
    const reader = resp.body.getReader();
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
    if (handle) await handle.close().catch(() => {});
    await unlink(dstPath).catch(() => {});
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/upgrade.test.ts`
Expected: PASS (11 pass).

- [ ] **Step 5: Commit**

```bash
git add src/upgrade.ts src/upgrade.test.ts
git commit -m "feat(upgrade): downloadAsset with streamed sha256 verification"
```

---

### Task 5: `installBinary` (atomic two-rename + rollback)

**Files:**
- Modify: `src/upgrade.ts`
- Test: `src/upgrade.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/upgrade.test.ts`:

```ts
import { installBinary } from './upgrade.js';
import { writeFile, stat } from 'fs/promises';

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
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/upgrade.test.ts`
Expected: FAIL — `installBinary` is not exported.

- [ ] **Step 3: Implement `installBinary`**

Append to `src/upgrade.ts`:

```ts
export type RenameImpl = (oldPath: string, newPath: string) => Promise<void>;

export async function installBinary(
  srcPath: string,
  targetPath: string,
  renameImpl: RenameImpl = rename,
): Promise<void> {
  const backup = targetPath + '.old';
  try {
    await renameImpl(targetPath, backup);
  } catch (err: any) {
    throw new Error(
      `cannot move existing binary aside: ${err?.message ?? err}`,
    );
  }
  try {
    await renameImpl(srcPath, targetPath);
  } catch (err: any) {
    try {
      await renameImpl(backup, targetPath);
    } catch {
      throw new Error(
        `failed to install new binary: ${err?.message ?? err}; original saved at ${backup} — restore manually`,
      );
    }
    throw new Error(`failed to install new binary: ${err?.message ?? err}`);
  }
  await unlink(backup).catch(() => {});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/upgrade.test.ts`
Expected: PASS (13 pass).

- [ ] **Step 5: Commit**

```bash
git add src/upgrade.ts src/upgrade.test.ts
git commit -m "feat(upgrade): atomic installBinary with rollback"
```

---

### Task 6: `runUpgrade` orchestrator + wire `--upgrade` into cli.ts

**Files:**
- Modify: `src/upgrade.ts`
- Modify: `src/cli.ts`
- Test: `src/upgrade.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/upgrade.test.ts`:

```ts
import { runUpgrade } from './upgrade.js';

describe('runUpgrade', () => {
  it('reports up-to-date and performs no download when on the latest tag', async () => {
    let fetchCalls = 0;
    const fetchImpl = (async (url: string) => {
      fetchCalls += 1;
      if (String(url).endsWith('/releases/latest')) {
        return new Response(
          JSON.stringify({ tag_name: 'v0.1.2', assets: [] }),
          { status: 200 },
        );
      }
      throw new Error('unexpected download call');
    }) as unknown as typeof fetch;

    const lines: string[] = [];
    const out = { write: (s: string) => (lines.push(s), true) } as unknown as NodeJS.WritableStream;

    await runUpgrade(out, {
      currentVersion: 'v0.1.2',
      apiBaseUrl: 'https://api.test',
      exePath: process.execPath,
      fetchImpl,
    });

    expect(lines.join('')).toContain('minimal-agent is up to date (v0.1.2).');
    expect(fetchCalls).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/upgrade.test.ts`
Expected: FAIL — `runUpgrade` is not exported.

- [ ] **Step 3: Implement `humanSize` + `runUpgrade`**

Append to `src/upgrade.ts`:

```ts
export function humanSize(n: number): string {
  const kb = 1024;
  const mb = 1024 * 1024;
  if (n >= mb) return `${(n / mb).toFixed(1)} MB`;
  if (n >= kb) return `${(n / kb).toFixed(1)} KB`;
  return `${n} B`;
}

export interface RunUpgradeOptions {
  currentVersion: string;
  apiBaseUrl?: string;
  exePath?: string;
  fetchImpl?: FetchImpl;
}

export async function runUpgrade(
  out: NodeJS.WritableStream,
  opts: RunUpgradeOptions,
): Promise<void> {
  const apiBaseUrl = opts.apiBaseUrl ?? 'https://api.github.com';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const currentVersion = opts.currentVersion;

  let target: string;
  try {
    target = realpathSync(opts.exePath ?? process.execPath);
  } catch (err: any) {
    throw new Error(
      `cannot determine minimal-agent binary path: ${err?.message ?? err}`,
    );
  }
  const dir = dirname(target);

  const release = await fetchLatestRelease(apiBaseUrl, currentVersion, fetchImpl);

  if (currentVersion !== 'dev' && release.tag_name === currentVersion) {
    out.write(`minimal-agent is up to date (${currentVersion}).\n`);
    return;
  }

  const assetName = assetNameForPlatform(process.platform, process.arch);
  const asset = pickAsset(release, assetName);

  out.write(`Current version: ${currentVersion}\n`);
  out.write(`Latest version:  ${release.tag_name}\n`);
  out.write(`Downloading ${asset.name} (${humanSize(asset.size)})...\n`);

  const tmpPath = join(dir, `.minimal-agent-upgrade-${process.pid}`);
  try {
    await downloadAsset(
      asset.browser_download_url,
      tmpPath,
      asset.digest,
      currentVersion,
      fetchImpl,
    );
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (
      msg.includes('EACCES') ||
      msg.includes('permission denied') ||
      msg.includes('EROFS')
    ) {
      throw new Error(
        `cannot write to ${dir}: ${msg} — re-run with sudo or move minimal-agent to a user-owned path`,
      );
    }
    throw err;
  }
  out.write('Verifying checksum... ok\n');

  out.write(`Installing to ${target}... `);
  try {
    await installBinary(tmpPath, target);
  } catch (err) {
    out.write('failed\n');
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
  out.write('ok\n');
  out.write(
    `Upgraded ${currentVersion} → ${release.tag_name}. Restart minimal-agent to use the new version.\n`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/upgrade.test.ts`
Expected: PASS (14 pass).

- [ ] **Step 5: Wire `--upgrade` into cli.ts**

In `src/cli.ts`, add to the import block (after the `import { VERSION } from './version.js';` added in Task 1):

```ts
import { runUpgrade } from './upgrade.js';
```

Replace the `if (import.meta.main)` block from Task 1:

```ts
if (import.meta.main) {
  if (process.argv.includes('--version')) {
    console.log(`minimal-agent ${VERSION}`);
    process.exit(0);
  } else if (isTUI) {
    startTUI().catch(console.error);
  } else {
    runLoop().catch(console.error);
  }
}
```

with:

```ts
if (import.meta.main) {
  if (process.argv.includes('--version')) {
    console.log(`minimal-agent ${VERSION}`);
    process.exit(0);
  } else if (process.argv.includes('--upgrade')) {
    runUpgrade(process.stderr, { currentVersion: VERSION })
      .then(() => process.exit(0))
      .catch((err: any) => {
        console.error(String(err?.message ?? err));
        process.exit(1);
      });
  } else if (isTUI) {
    startTUI().catch(console.error);
  } else {
    runLoop().catch(console.error);
  }
}
```

- [ ] **Step 6: Update the HELP text in cli.ts**

In `src/cli.ts`, find the `Usage:` line in the `HELP` constant (added/edited in a prior release):

```
Usage: minimal-agent [--no-tui]
```

Replace with:

```
Usage: minimal-agent [--no-tui] [--version] [--upgrade]
```

- [ ] **Step 7: Run the full test suite**

Run: `bun test`
Expected: PASS — all suites green (existing `cli.test.ts`, `version.test.ts`, `upgrade.test.ts`, `parse-keypress.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add src/upgrade.ts src/upgrade.test.ts src/cli.ts
git commit -m "feat(cli): --upgrade self-update from GitHub releases"
```

---

### Task 7: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Build a deliberately-old versioned binary**

Run: `MINIMAL_AGENT_VERSION=v0.1.0 bun run build`
Expected: build succeeds; `git diff --stat src/version.ts` shows no changes (restored).

- [ ] **Step 2: Verify `--version` on the built binary**

Run: `./dist/minimal-agent-linux-x64 --version`
Expected: `minimal-agent v0.1.0`

- [ ] **Step 3: Run `--upgrade` against the live repo**

Run: `./dist/minimal-agent-linux-x64 --upgrade`
Expected: prints `Current version: v0.1.0`, `Latest version: <newest tag>`, downloads `minimal-agent-linux-x64`, `Verifying checksum... ok`, `Installing to .../dist/minimal-agent-linux-x64... ok`, `Upgraded v0.1.0 → <tag>...`. Exit code 0.

- [ ] **Step 4: Confirm the binary was actually replaced**

Run: `./dist/minimal-agent-linux-x64 --version`
Expected: prints the latest published tag (no longer `v0.1.0`).

- [ ] **Step 5: Verify the up-to-date path**

Run: `./dist/minimal-agent-linux-x64 --upgrade`
Expected: `minimal-agent is up to date (<tag>).` Exit code 0.

- [ ] **Step 6: Verify the permission-denied message**

Run:
```bash
sudo cp ./dist/minimal-agent-linux-x64 /opt/ma-test/minimal-agent 2>/dev/null || (sudo mkdir -p /opt/ma-test && sudo cp ./dist/minimal-agent-linux-x64 /opt/ma-test/minimal-agent)
/opt/ma-test/minimal-agent --upgrade; echo "exit=$?"
```
Expected: a message containing `cannot write to /opt/ma-test:` and `re-run with sudo or move minimal-agent to a user-owned path`; `exit=1`. Clean up: `sudo rm -rf /opt/ma-test`.

- [ ] **Step 7: Rebuild the clean (dev) dist so the working tree is release-neutral**

Run: `bun run build && ./dist/minimal-agent-linux-x64 --version`
Expected: `minimal-agent dev`

---

## Self-Review

**1. Spec coverage:**
- `--version` (embedded, `dev` default) → Task 1. ✓
- `--upgrade` flag parsed before TUI/REPL → Task 6 Step 5. ✓
- Build-time version embedding + restore → Task 1 Steps 7-8. ✓
- `assetNameForPlatform` / multi-platform asset names → Task 2. ✓
- `pickAsset` + missing-asset error → Task 2. ✓
- `fetchLatestRelease` (headers, timeout, non-200, parse error) → Task 3. ✓
- `downloadAsset` (stream, sha256, non-200, mismatch, cleanup) → Task 4. ✓
- `installBinary` (two-rename, rollback, symlink-resolved target) → Task 5 + `realpathSync` in Task 6. ✓
- `runUpgrade` orchestration, up-to-date short-circuit, permission hint → Task 6. ✓
- Busy-binary handled via rename (no in-place write) → Task 5 design. ✓
- Manual verification incl. permission-denied → Task 7. ✓
- Out-of-scope items (no retries/channels/auto-restart/startup-notice) → not implemented. ✓

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has expected output. ✓

**3. Type consistency:** `Release`/`Asset`/`FetchImpl`/`RenameImpl`/`RunUpgradeOptions` defined in Tasks 2/3/5/6 and used consistently. `runUpgrade(out, opts)` signature matches the cli.ts call site (`runUpgrade(process.stderr, { currentVersion: VERSION })`). `VERSION` import path `./version.js` consistent across Tasks 1 and 6. ✓

No gaps found.
