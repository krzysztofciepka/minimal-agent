# Design: GKE & Transaction-Flow Debugging Skills

**Date:** 2026-05-17
**Status:** Approved
**Source task:** Task 16 (Prywatne) — debugging GKE cluster services & debugging transaction flows

## Goal

Ship two **built-in** debugging skills with `minimal-agent` so they work out of
the box without the user creating files in `~/.claude/skills/`:

1. **GKE service debugging** — given a service name, inspect Cloud Logging and
   GKE pod/service health, optionally consult the source repo and MySQL for
   context, then explain the error and identify which code originated it.
2. **Transaction-flow debugging** — given a `transaction_id`, read the MySQL
   transaction record and the associated customer-interaction progress, and
   determine the step where the flow stopped or failed.

## Background

`minimal-agent` is a TS/Bun LLM agent loop. Skills are markdown playbooks loaded
**only** from `~/.claude/skills/<name>` via the `skill` tool
(`src/tools/skill.ts`) and listed by `src/commands/skills.ts`. There are no
bundled/built-in skills today. The agent already has `bash`, `file_read`,
`grep`, `glob`, `ask_user` tools. Binaries are produced by
`bun build ./src/cli.ts --compile` (`scripts/build.ts`).

## Decisions

- **Delivery:** bundled skills directory, merged with the user dir; a user file
  of the same name overrides the built-in.
- **Environment config:** documented env vars, falling back to `ask_user` when
  unset. No new config-file schema.
- **Logic:** markdown playbooks **plus** dedicated read-only tools wrapping
  `gcloud`/`kubectl`.
- **DB safety:** read-only, enforced in the playbook text.
- **GCP tool surface:** focused read-only debug verbs (no mutating ops).
- **Missing deps:** clear, actionable error; no auto-install, no silent
  fallback.

## Architecture

### 1. Built-in skill bundling

- New directory `src/skills/` containing:
  - `gke-service-debug.md`
  - `transaction-flow-debug.md`
- `src/skills/index.ts`:
  - Imports each markdown file as text using Bun's text import
    (`import gke from './gke-service-debug.md' with { type: 'text' }`) so the
    content is embedded in the `--compile` binary (no runtime filesystem
    dependency).
  - Exports `BUILTIN_SKILLS: Skill[]`, each `{ name, description, content }`.
    `name` and `description` are declared in `index.ts` alongside the imported
    content (no frontmatter parsing required).
  - Exports a helper `getBuiltinSkill(name: string): Skill | undefined`.
- `src/tools/skill.ts` resolution order:
  1. `~/.claude/skills/<name>/<*.md>` — if present, use it (user override).
  2. Otherwise, `getBuiltinSkill(name)` — if present, return its content.
  3. Otherwise, the existing "No skill found" error.
- `src/commands/skills.ts`: list the union of user-dir skill names and
  built-in skill names (deduplicated). Built-ins are tagged, e.g.
  `gke-service-debug (built-in)`. If the user dir is missing/empty, built-ins
  are still listed.

### 2. Focused read-only GCP tools

Each is a typed `Tool` (zod params) implemented over the existing
`execFileNoThrow` util, registered in `src/tools/index.ts`. None expose
mutating verbs.

| Tool | Wraps | Key params |
|---|---|---|
| `gke_get_credentials` | `gcloud container clusters get-credentials <cluster> --project <p> (--region\|--zone) <loc>` | `cluster`, `project`, `location` |
| `gcloud_logging` | `gcloud logging read <filter> --project <p> --limit <n> --freshness <d> --format=json` | `filter`, `project`, `limit?`, `freshness?` |
| `kubectl_get` | `kubectl get <resource> [name] -n <ns> -o <json\|wide>` | `resource`, `name?`, `namespace?`, `output?` |
| `kubectl_describe` | `kubectl describe <resource> <name> -n <ns>` | `resource`, `name`, `namespace?` |
| `kubectl_logs` | `kubectl logs <pod> -n <ns> [--container c] [--tail n] [--previous]` | `pod`, `namespace?`, `container?`, `tail?`, `previous?` |

Common behavior:

- **Missing binary:** spawn error / `ENOENT` → `isError` result with an
  actionable message naming the missing binary and how to install it
  (e.g. "install the Google Cloud SDK" / "install kubectl").
- **Missing/invalid auth or context:** detect well-known stderr signatures
  (e.g. gcloud `not logged in` / `Reauthentication`, kubectl
  `Unable to connect to the server` / `no such context`) → `isError` with the
  remediation command (`gcloud auth login`, run `gke_get_credentials` first).
  No auto-install, no silent fallback to bash.
- **Output cap:** truncate combined stdout/stderr at 256 KB, mirroring
  `bashTool`'s `truncate` behavior.
- **Timeout:** default 120 s per invocation, overridable via a `timeout_ms`
  param, same default as `bashTool`.
- Non-zero exit with no recognized signature: return stdout+stderr+exit code
  as a normal (non-`isError`) result so the agent can interpret it.

### 3. Environment resolution

Tools take explicit params only — they never read env vars themselves. The
**playbooks** instruct the agent to resolve inputs in this order:

1. Read documented env vars:
   - GKE: `GKE_PROJECT`, `GKE_CLUSTER`, `GKE_LOCATION`
   - Source: `SERVICE_REPO_PATH`
   - MySQL: `MYSQL_DSN` (preferred) or `MYSQL_HOST`, `MYSQL_PORT`,
     `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
2. If a required value is unset, ask the user via the `ask_user` tool.

GCP auth is assumed ambient (existing `gcloud`/`kubectl` credentials);
`gke_get_credentials` is the supported way to (re)establish the kube context.

### 4. MySQL access

No dedicated MySQL tool. The playbooks drive the existing `bash` tool with the
`mysql` client. Read-only is **enforced in the playbook text**:

- Only `SELECT`, `SHOW`, `DESCRIBE`/`EXPLAIN` statements; never `INSERT`,
  `UPDATE`, `DELETE`, or DDL.
- Table/column names are unknown, so the playbook discovers schema dynamically
  with `SHOW TABLES` and `DESCRIBE <table>` before querying.
- Connection details come from the env-var/`ask_user` resolution above.

### 5. Playbook content

**`gke-service-debug.md`** — input: a service name.

1. Resolve `GKE_PROJECT` / `GKE_CLUSTER` / `GKE_LOCATION` (env → `ask_user`).
2. `gke_get_credentials` to set the kube context.
3. `kubectl_get` deployments/pods/services for the service; assess health
   (CrashLoopBackOff, high restart counts, not-Ready, pending).
4. `kubectl_describe` unhealthy pods; `kubectl_logs` (including `--previous`)
   to capture error output.
5. `gcloud_logging` query scoped to the service at severity `>= ERROR` over a
   recent window.
6. If still inconclusive, locate the source via `SERVICE_REPO_PATH` and `grep`
   the observed error to map it to a code path.
7. If needed, gather read-only MySQL context.
8. Output: a clear explanation of the error and the originating code location.

**`transaction-flow-debug.md`** — input: a `transaction_id`.

1. Resolve MySQL connection (env → `ask_user`); enforce read-only.
2. Discover schema: `SHOW TABLES`; `DESCRIBE` the transaction and
   customer-interaction/progress tables.
3. Fetch the transaction row for `transaction_id`.
4. Fetch the associated customer-interaction progress records.
5. Reconstruct the step sequence using status fields and timestamps; find the
   first step that did not complete (failed status, missing follow-on row,
   stalled timestamp).
6. Output: actionable findings naming the specific step where the flow stopped
   or failed, with the supporting evidence.

## Error Handling Summary

- GCP tools: structured `isError` results for missing binary, missing auth,
  missing context; plain results otherwise. No process is mutated.
- Skill resolution: unknown name yields the existing "No skill found" error.
- Playbooks instruct the agent to surface unmet prerequisites (missing env,
  failed auth) to the user rather than guessing.

## Testing

- `src/skills/index.test.ts` — every built-in skill loads with non-empty
  `name`, `description`, `content`; names are unique.
- `src/tools/skill.test.ts` — built-in name resolves to its content; a user
  file of the same name (temp `HOME`) overrides the built-in; unknown name
  errors.
- GCP tool tests — place fake `gcloud`/`kubectl` executables on `PATH` in a
  temp dir to assert argv construction for each verb and the missing-binary /
  auth error mapping; assert no mutating subcommands are reachable.
- `src/commands/skills.ts` test — built-ins appear in the listing, with and
  without a user skills dir, deduped against same-named user skills.

## Out of Scope (YAGNI)

- A config-file schema for cluster/DB settings.
- Mutating/remediation operations (kubectl rollout/scale/delete).
- A dedicated MySQL tool or driver dependency.
- Frontmatter parsing for built-in skills.
- Auto-installing gcloud/kubectl or auto-running `gcloud auth login`.
