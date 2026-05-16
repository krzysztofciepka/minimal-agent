# Self-upgrade (`minimal-agent --upgrade`) — design

## Goal

Let a user update their installed `minimal-agent` binary in place by running
`minimal-agent --upgrade`. The command fetches the most recent release from
GitHub, verifies it, and atomically replaces the running binary. A companion
`minimal-agent --version` prints the embedded version and exits.

This mirrors the already-shipped `clipad` self-upgrade design
(`krzysztofciepka/clipad`, `docs/superpowers/specs/2026-04-25-self-upgrade-design.md`),
retargeted from Go to this repo's TypeScript/Bun stack and multi-platform
release assets.

## Scope

**In scope**
- New CLI flags `--upgrade` and `--version`, parsed in `src/cli.ts` before the
  TUI/REPL is started (alongside the existing `--no-tui` parsing).
- Build-time version embedding (`src/version.ts`, rewritten by
  `scripts/build.ts`).
- Download of the GitHub release asset matching the running platform.
- SHA-256 verification against the asset's `digest` field returned by the
  GitHub API.
- Atomic in-place replacement with a `.old` rollback safety net.

**Out of scope**
- Auto-restart of the running TUI/REPL. `--upgrade` is a one-shot subcommand;
  the user re-launches `minimal-agent` afterwards.
- Channel selection (stable/beta/etc.). Only the latest release is considered.
- Retry loops. A single attempt per HTTP call; the user re-runs on transient
  failure.
- Package-manager / install-script integration.
- A startup "update available" notice (explicitly de-scoped by the user).

## User-facing behavior

### `minimal-agent --version`

```
minimal-agent v0.1.3
```

Exits 0. The version string is whatever was baked in at build time. For a
local `bun run`/`bun build` without the release rewrite, it stays `dev`.

### `minimal-agent --upgrade`

Successful run, on stderr:

```
Current version: v0.1.2
Latest version:  v0.1.3
Downloading minimal-agent-linux-x64 (96.5 MB)...
Verifying checksum... ok
Installing to /home/kc/.local/bin/minimal-agent... ok
Upgraded v0.1.2 → v0.1.3. Restart minimal-agent to use the new version.
```

Special cases:

| Case | Output | Exit |
|------|--------|------|
| Already on latest tag | `minimal-agent is up to date (v0.1.3).` | 0 |
| No asset for current platform | `no asset matching minimal-agent-<platform> in release <tag>` | 1 |
| Permission denied on install dir | `cannot write to <dir>: <err> — re-run with sudo or move minimal-agent to a user-owned path` | 1 |
| Network / API / checksum failure | Specific message (see Error handling) | 1 |

The current version is read from the compiled-in `VERSION` constant,
defaulting to `dev` for unversioned builds. When `VERSION === 'dev'` the
latest-comparison shortcut is skipped (a `dev` build always proceeds to
download), matching clipad.

## Architecture

```
src/version.ts
  └── export const VERSION = 'dev'      ← rewritten to the tag by build.ts at release

src/cli.ts
  └── flag prologue (before TUI/REPL bootstrap):
        --version  → print VERSION, exit 0
        --upgrade  → await runUpgrade(process.stderr); exit 0|1
        (existing --no-tui / --repl logic unchanged)

src/upgrade.ts
  ├── REPO_OWNER = 'krzysztofciepka'
  ├── REPO_NAME  = 'minimal-agent'
  ├── assetNameForPlatform(platform, arch): string
  ├── pickAsset(release, assetName): Asset
  ├── fetchLatestRelease(apiBaseUrl, version, fetchImpl?): Release
  ├── downloadAsset(url, dstPath, expectedDigest, version, fetchImpl?): void
  ├── installBinary(srcPath, targetPath, renameImpl?): void
  └── runUpgrade(out, opts): Promise<void>   // orchestrator

src/upgrade.test.ts
  └── unit tests with a stub fetch + os.tmpdir() working dirs
```

**Why one file:** the whole feature is one cohesive ~250-line flow. Splitting
adds navigation cost without clarity. Same rationale as clipad's `upgrade.go`.

**Dependencies:** standard library only — global `fetch`, `node:crypto`
(`createHash('sha256')`), `node:fs`/`node:fs/promises`, `node:path`,
`node:os`, `process`. No new packages in `package.json`.

**Interaction with TUI/REPL:** none. `runUpgrade` runs and the process exits
before `startTUI()` / `runLoop()` is called.

## Asset naming

`scripts/build.ts` already emits, per target, files named:

| platform / arch | asset name |
|---|---|
| linux x64 | `minimal-agent-linux-x64` |
| linux arm64 | `minimal-agent-linux-arm64` |
| darwin x64 | `minimal-agent-darwin-x64` |
| darwin arm64 | `minimal-agent-darwin-arm64` |
| windows x64 | `minimal-agent-windows-x64.exe` |

Unlike clipad, the version is **not** in the asset name. `assetNameForPlatform`
maps `process.platform` (`linux`/`darwin`/`win32`) and `process.arch`
(`x64`/`arm64`) to the table above (`win32` → `windows`, append `.exe`). If the
resolved name is not among the release's assets (e.g. a platform that release
did not ship), `pickAsset` returns a descriptive error. Multi-platform is
supported; no hard linux-only gate.

## Data flow

```
runUpgrade(out, { currentVersion, apiBaseUrl, exePath })
  │
  ├─ 1. Resolve install path
  │     exe    = exePath ?? process.execPath
  │     target = fs.realpathSync(exe)         // follow symlinks; replace the real file
  │     dir    = path.dirname(target)
  │
  ├─ 2. fetchLatestRelease(apiBaseUrl, currentVersion)
  │     GET <apiBaseUrl>/repos/krzysztofciepka/minimal-agent/releases/latest
  │       Headers: Accept: application/vnd.github+json
  │                User-Agent: minimal-agent-upgrader/<version>
  │       AbortSignal.timeout(30_000)
  │     Parse minimal shape:
  │       { tag_name, assets: [{ name, browser_download_url, size, digest }] }
  │
  ├─ 3. Compare versions
  │     latest = release.tag_name
  │     if currentVersion !== 'dev' && latest === currentVersion:
  │         print "minimal-agent is up to date (<v>)."; return
  │     // String equality only: tags are produced by us, always vX.Y.Z; we
  │     // never need ordering, only equality (same as clipad).
  │
  ├─ 4. pickAsset(release, assetNameForPlatform(process.platform, process.arch))
  │
  ├─ 5. downloadAsset(asset.browser_download_url, tmp, asset.digest, version)
  │     tmp = path.join(dir, `.minimal-agent-upgrade-${process.pid}`)  // same dir → atomic rename
  │     stream response body → file, feeding a sha256 hash in parallel
  │     got  = hex(hash)
  │     want = asset.digest without "sha256:" prefix
  │     if got !== want: throw checksum mismatch  (tmp removed)
  │     chmod tmp 0o755
  │     on any failure: unlink tmp
  │
  └─ 6. installBinary(tmp, target)
        backup = target + '.old'
        rename(target, backup)              // move running binary aside
        try rename(tmp, target)
        catch:
            rename(backup, target)          // best-effort rollback
            throw "failed to install new binary"
        unlink(backup)                      // ignore error; cosmetic by now
```

### Same-filesystem invariant

The temp file is created in `dir` (not `os.tmpdir()`), so both renames in
step 6 are atomic on Linux/macOS. Using the system temp dir would risk
`EXDEV` (cross-device) when temp is a separate filesystem.

### Busy-binary handling

The currently-running binary cannot be overwritten in place
(`ETXTBSY` / "text file busy" — the failure we hit with `cp` during manual
installs). `rename(2)` does **not** have this problem: it swaps the directory
entry while the running process keeps its original inode. This is why the
install step uses two renames, never an in-place write to `target`.

### Symlinks

`process.execPath` may be a symlink (e.g. `/usr/local/bin/minimal-agent` →
versioned path). `fs.realpathSync` resolves it; the temp file is placed beside
the real file and the swap replaces the real file. Existing symlinks keep
working because they are never touched.

### Single attempt, no retries

`--upgrade` is invoked manually. On a network flake the user re-runs it. A
retry loop adds code without meaningful UX gain.

## Error handling

Every error from `runUpgrade()` is written to stderr; the process exits 1.
Messages are specific enough that the user knows the next step.

| Failure point | Message | Recovery |
|---|---|---|
| `process.execPath` / realpath fails | `cannot determine minimal-agent binary path: <err>` | Unusual env |
| GitHub API non-200 | `failed to fetch latest release: <status>: <body-snippet>` | Network / rate limit |
| Release JSON parse fails | `failed to parse release metadata: <err>` | Upstream API change |
| Already on latest | `minimal-agent is up to date (<v>).` (exit 0) | — |
| No matching asset | `no asset matching <name> in release <tag>` | Publish issue |
| Download HTTP non-200 | `failed to download <url>: <status>` | Retry |
| I/O during download | `download interrupted: <err>` | Retry |
| Checksum mismatch | `checksum mismatch: expected <hex>, got <hex>` | Refuse to install |
| Cannot create temp in `dir` | `cannot write to <dir>: <err> — re-run with sudo or move minimal-agent to a user-owned path` | Permissions hint |
| `chmod` fails on temp | `cannot make new binary executable: <err>` | Tmp removed |
| Backup rename fails | `cannot move existing binary aside: <err>` | Original untouched |
| Final rename fails after backup | Restore `.old`, then `failed to install new binary: <err>` | Original restored |
| Restore-after-failure also fails | `failed to install new binary: <err>; original saved at <target>.old — restore manually` | Manual recovery |

**Cleanup discipline**
- The temp file is removed on every download/verify failure path.
- The `.old` backup is removed only after the final rename succeeds. If both
  the final rename and the rollback fail, `.old` is left and the user is told
  where it is.

**No partial-state windows:** at every point in the install step, either the
original binary is at `target` (possibly via rollback) or the new binary is —
there is never a window where `target` is missing.

## Build / release process changes

`src/version.ts` defaults to `export const VERSION = 'dev'`. `scripts/build.ts`,
immediately before each `bun build --compile`, rewrites that file to the
release tag, runs the build, then restores the file to `'dev'` in a `finally`
block (so the working tree and local dev builds stay `dev`).

The tag is supplied to the build via an env var or arg
(`MINIMAL_AGENT_VERSION` / `--version=<tag>`); the implementation plan pins the
exact mechanism. When absent, the rewrite is skipped and the build stays
`dev` — local `bun run build` is unaffected.

The release-cut steps (`gh release create`, asset upload) are otherwise
unchanged.

## Testing

Hermetic unit tests with a stubbed `fetch` and `os.tmpdir()` working dirs,
mirroring `upgrade_test.go`'s structure.

**`assetNameForPlatform`** (table-driven)
- `linux/x64` → `minimal-agent-linux-x64`; `darwin/arm64` →
  `minimal-agent-darwin-arm64`; `win32/x64` → `minimal-agent-windows-x64.exe`.

**`pickAsset`**
- Exact match found.
- No matching asset → descriptive error including the wanted name and tag.
- Multiple assets present → picks the right one.

**`fetchLatestRelease`** — stub fetch returning canned responses
- Success: parsed release with tag + asset list.
- Non-200: error includes status code and body snippet.
- Malformed JSON: error mentions parse failure.

**`downloadAsset`** — stub fetch serving a known byte payload
- Success: written file equals payload; computed sha256 equals expected digest.
- Non-200 → error wraps status; temp file cleaned up.
- Digest mismatch → error contains both hashes; temp file cleaned up.

**`installBinary`** — inside an `os.tmpdir()` scratch dir
- Happy path: `target` content equals `src`; no `.old` left; mode `0755`.
- Target is a symlink → resolved file replaced, not the symlink.
- Second rename fails (injected `renameImpl`) → backup restored; `target` has
  original bytes.

**`runUpgrade` already-latest**
- Stub returns a release whose tag equals `currentVersion` → no download
  performed, returns without error.

**Out of scope for tests:** executing the upgraded binary. Byte-equality with
the downloaded payload is sufficient.

**Manual verification before release**
1. Build with version `v0.1.2`. Run `./minimal-agent --upgrade` against the
   live repo; confirm it pulls the latest, swaps the binary, and
   `./minimal-agent --version` then prints the new tag.
2. Run `./minimal-agent --upgrade` again; confirm the "up to date" path.
3. Place the binary in a root-owned dir; confirm the permission-denied message.

## Open questions

None at design time. The exact version-injection mechanism for `build.ts`
(env var vs arg) and download progress output are implementation details the
plan will pin down.
