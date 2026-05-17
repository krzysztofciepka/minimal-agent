# GKE & Transaction-Flow Debugging Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two built-in debugging skills (GKE service debug, transaction-flow debug) with `minimal-agent`, plus focused read-only `gcloud`/`kubectl` tools, working out of the box.

**Architecture:** Markdown playbooks are bundled in `src/skills/`, embedded into the compiled binary via Bun text imports, and exposed through the existing `skill` tool (user `~/.claude/skills/` files override built-ins). A shared `runGcp` helper wraps `gcloud`/`kubectl` via `Bun.spawn`, mapping missing-binary/auth failures to actionable errors; five thin typed tools build on it. MySQL access stays in the playbook text via the existing `bash` tool, read-only.

**Tech Stack:** TypeScript, Bun (runtime + `bun build --compile` + `bun:test`), Zod.

**Reference spec:** `docs/superpowers/specs/2026-05-17-debug-skills-design.md`

---

### Task 1: GKE service-debug playbook

**Files:**
- Create: `src/skills/gke-service-debug.md`

- [ ] **Step 1: Write the playbook**

`src/skills/gke-service-debug.md`:

```markdown
# Skill: gke-service-debug

Debug a GCP-hosted GKE service: explain the error and identify the originating code.

## Input
A service name (Kubernetes workload / deployment name). If not given, ask the user.

## Step 1 — Resolve environment

Read these environment variables (use the `bash` tool, e.g. `printenv GKE_PROJECT`):
- `GKE_PROJECT`, `GKE_CLUSTER`, `GKE_LOCATION` (region or zone)
- `SERVICE_REPO_PATH` (local path to the service source repo; optional)
- MySQL: `MYSQL_DSN`, or `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE` (optional)

For any required GKE value that is unset, ask the user with the `ask_user` tool. Do not guess.

## Step 2 — Establish cluster context

Call `gke_get_credentials` with the resolved `cluster`, `project`, `location`.
If it returns an error about a missing binary or auth, surface that to the user and stop.

## Step 3 — Assess workload health

- `kubectl_get` resource `deployments` (name = service) — check desired vs ready replicas.
- `kubectl_get` resource `pods` filtered by the service — look for `CrashLoopBackOff`,
  high restart counts, `Pending`, not-`Ready`.
- `kubectl_get` resource `services` (name = service) — confirm it exists and has endpoints.

## Step 4 — Inspect unhealthy pods

For each unhealthy pod:
- `kubectl_describe` resource `pod` — read Events (image pull errors, OOMKilled, probe failures).
- `kubectl_logs` for the pod; also with `previous: true` to capture the last crash.

## Step 5 — Query Cloud Logging

`gcloud_logging` with a filter scoped to the service at severity >= ERROR over a recent
window, e.g. filter:
`resource.type="k8s_container" resource.labels.container_name="<service>" severity>=ERROR`
freshness: `1h` (widen if empty).

## Step 6 — Map error to code (if logs are inconclusive)

If `SERVICE_REPO_PATH` is set, `grep` the observed error message / stack frame there to
locate the originating function/file. If unset, ask the user for the repo path or skip.

## Step 7 — MySQL context (only if still needed)

Resolve the MySQL connection (Step 1). Use the `bash` tool with the `mysql` client.
READ-ONLY: only `SELECT`, `SHOW`, `DESCRIBE`/`EXPLAIN`. Never `INSERT`/`UPDATE`/`DELETE`/DDL.
Discover schema first (`SHOW TABLES`, `DESCRIBE <table>`) before querying for error context.

## Output

A clear explanation of the error and the specific code location (file + symbol) that
originated it, with the evidence (log line / pod event) that supports the conclusion.
```

- [ ] **Step 2: Commit**

```bash
git add src/skills/gke-service-debug.md
git commit -m "feat(skills): GKE service-debug playbook"
```

---

### Task 2: Transaction-flow-debug playbook

**Files:**
- Create: `src/skills/transaction-flow-debug.md`

- [ ] **Step 1: Write the playbook**

`src/skills/transaction-flow-debug.md`:

```markdown
# Skill: transaction-flow-debug

Investigate a failed transaction by reading MySQL records and customer-interaction
progress, and identify the step where the flow stopped or failed.

## Input
A `transaction_id`. If not given, ask the user with the `ask_user` tool.

## Step 1 — Resolve MySQL connection

Read environment variables (use the `bash` tool, e.g. `printenv MYSQL_DSN`):
- `MYSQL_DSN` (preferred), or `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`,
  `MYSQL_PASSWORD`, `MYSQL_DATABASE`.

For any required value that is unset, ask the user with `ask_user`. Do not guess.

## Step 2 — Read-only discipline

All queries run via the `bash` tool with the `mysql` client. ONLY `SELECT`, `SHOW`,
`DESCRIBE`/`EXPLAIN`. Never `INSERT`, `UPDATE`, `DELETE`, or DDL. Prefer
`mysql --batch --raw -e "<query>"`.

## Step 3 — Discover schema

`SHOW TABLES;` then `DESCRIBE` the tables that look like the transaction table and the
customer-interaction / progress / steps table(s). Table and column names are unknown —
infer them from the schema, do not assume.

## Step 4 — Fetch the transaction

`SELECT * FROM <transactions_table> WHERE <id_column> = '<transaction_id>';`
Note its status and timestamps.

## Step 5 — Fetch interaction progress

Find the rows linked to the transaction (via the transaction id or a foreign key) in the
customer-interaction / progress table(s). Order them by step index or timestamp.

## Step 6 — Reconstruct the flow

Walk the steps in order. Identify the first step that did not complete: a failed/aborted
status, a missing expected follow-on row, or a timestamp gap where the flow stalled.

## Output

Actionable findings: the specific step where the flow stopped or failed, its status and
timestamp, and the supporting rows. State the failure point explicitly.
```

- [ ] **Step 2: Commit**

```bash
git add src/skills/transaction-flow-debug.md
git commit -m "feat(skills): transaction-flow-debug playbook"
```

---

### Task 3: Built-in skills registry

**Files:**
- Create: `src/skills/skills.d.ts`
- Create: `src/skills/index.ts`
- Test: `src/skills/index.test.ts`

- [ ] **Step 1: Write the failing test**

`src/skills/index.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { BUILTIN_SKILLS, getBuiltinSkill } from './index.js';

describe('BUILTIN_SKILLS', () => {
  it('includes both debugging skills with non-empty fields', () => {
    const names = BUILTIN_SKILLS.map(s => s.name).sort();
    expect(names).toEqual(['gke-service-debug', 'transaction-flow-debug']);
    for (const s of BUILTIN_SKILLS) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.content.length).toBeGreaterThan(0);
    }
  });

  it('has unique names', () => {
    const names = BUILTIN_SKILLS.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('getBuiltinSkill returns content by name and undefined otherwise', () => {
    expect(getBuiltinSkill('gke-service-debug')?.content).toContain('gke-service-debug');
    expect(getBuiltinSkill('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/skills/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 3: Add the `*.md` text-module declaration**

`src/skills/skills.d.ts`:

```ts
declare module '*.md' {
  const content: string;
  export default content;
}
```

- [ ] **Step 4: Write the registry**

`src/skills/index.ts`:

```ts
// Built-in skills bundled with minimal-agent.
// Markdown is imported as text so it is embedded by `bun build --compile`.
import type { Skill } from '../types.js';
import gkeServiceDebug from './gke-service-debug.md' with { type: 'text' };
import transactionFlowDebug from './transaction-flow-debug.md' with { type: 'text' };

export const BUILTIN_SKILLS: Skill[] = [
  {
    name: 'gke-service-debug',
    description:
      'Debug a GKE-hosted service: inspect Cloud Logging and pod/service health, ' +
      'optionally consult source and MySQL, and identify the originating code.',
    content: gkeServiceDebug,
  },
  {
    name: 'transaction-flow-debug',
    description:
      'Investigate a failed transaction via read-only MySQL and customer-interaction ' +
      'progress, and identify the step where the flow stopped or failed.',
    content: transactionFlowDebug,
  },
];

export function getBuiltinSkill(name: string): Skill | undefined {
  return BUILTIN_SKILLS.find(s => s.name === name);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/skills/index.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/skills/skills.d.ts src/skills/index.ts src/skills/index.test.ts
git commit -m "feat(skills): built-in skills registry embedded in binary"
```

---

### Task 4: Skill tool resolves built-ins with user override

**Files:**
- Modify: `src/tools/skill.ts`
- Test: `src/tools/skill.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tools/skill.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/skill.test.ts`
Expected: FAIL — the built-in fallback test fails ("No skill found").

- [ ] **Step 3: Update the skill tool**

Replace the body of `src/tools/skill.ts` with:

```ts
// Skill tool - invoke skills (user dir overrides built-ins)
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { getBuiltinSkill } from '../skills/index.js';

const paramsSchema = z.object({
  name: z.string().describe('Name of the skill to invoke'),
  args: z.string().optional().describe('Arguments for the skill'),
});

function skillsDir(): string {
  return join(homedir(), '.claude', 'skills');
}

async function readUserSkill(name: string): Promise<string | undefined> {
  try {
    const skillDir = join(skillsDir(), name);
    const files = await readdir(skillDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    if (mdFiles.length === 0) return undefined;
    return await readFile(join(skillDir, mdFiles[0]), 'utf-8');
  } catch {
    return undefined;
  }
}

export const skillTool: Tool = {
  name: 'skill',
  description: 'Invoke a skill by name',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { name } = paramsSchema.parse(params);

    const userContent = await readUserSkill(name);
    const content = userContent ?? getBuiltinSkill(name)?.content;

    if (content === undefined) {
      return { content: `No skill found: ${name}`, isError: true };
    }

    return {
      content: [{ type: 'text', text: `# Skill: ${name}\n\n${content}` }],
    };
  },
};
```

Note: `homedir()` reads `$HOME` at call time, so the temp-HOME test works.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/skill.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/skill.ts src/tools/skill.test.ts
git commit -m "feat(skills): skill tool resolves built-ins, user files override"
```

---

### Task 5: `skills` command lists built-ins (deduped)

**Files:**
- Modify: `src/commands/skills.ts`
- Test: `src/commands/skills.test.ts`

- [ ] **Step 1: Write the failing test**

`src/commands/skills.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/commands/skills.test.ts`
Expected: FAIL — output has no built-ins / no "built-in" tag.

- [ ] **Step 3: Update the command**

Replace `src/commands/skills.ts` with:

```ts
// Skills command - list available skills (user + built-in)
import { readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { BUILTIN_SKILLS } from '../skills/index.js';

export async function handleSkills(): Promise<string> {
  const skillsDir = join(homedir(), '.claude', 'skills');

  let userSkills: string[] = [];
  try {
    const dirs = await readdir(skillsDir, { withFileTypes: true });
    userSkills = dirs.filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    userSkills = [];
  }

  const userSet = new Set(userSkills);
  const builtinOnly = BUILTIN_SKILLS
    .map(s => s.name)
    .filter(n => !userSet.has(n));

  const lines = [
    ...userSkills.map(n => `  ${n}`),
    ...builtinOnly.map(n => `  ${n} (built-in)`),
  ];

  if (lines.length === 0) return 'No skills found.';
  return `Available skills:\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/commands/skills.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/commands/skills.ts src/commands/skills.test.ts
git commit -m "feat(skills): list built-in skills, dedupe user overrides"
```

---

### Task 6: Shared `runGcp` helper

**Files:**
- Create: `src/tools/gcpExec.ts`
- Test: `src/tools/gcpExec.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tools/gcpExec.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { runGcp } from './gcpExec.js';

let bin: string;
const origPath = process.env.PATH;

async function fakeBin(name: string, script: string) {
  const p = join(bin, name);
  await writeFile(p, `#!/bin/bash\n${script}\n`);
  await chmod(p, 0o755);
}

beforeEach(async () => {
  bin = await mkdtemp(join(tmpdir(), 'ma-bin-'));
});

afterEach(async () => {
  process.env.PATH = origPath;
  await rm(bin, { recursive: true, force: true });
});

describe('runGcp', () => {
  it('passes argv through to the binary and returns its output', async () => {
    await fakeBin('gcloud', 'echo "ARGS:$*"; exit 0');
    process.env.PATH = bin;
    const r = await runGcp('gcloud', ['logging', 'read', 'sev>=ERROR']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('ARGS:logging read sev>=ERROR');
  });

  it('maps a missing binary to an install hint', async () => {
    process.env.PATH = bin; // empty dir, no kubectl
    const r = await runGcp('kubectl', ['get', 'pods']);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/kubectl.*not found/i);
    expect(r.message).toContain('kubernetes.io');
  });

  it('maps a kubectl auth/context failure to remediation', async () => {
    await fakeBin('kubectl', 'echo "Unable to connect to the server" 1>&2; exit 1');
    process.env.PATH = bin;
    const r = await runGcp('kubectl', ['get', 'pods']);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/gke_get_credentials|kube context/i);
  });

  it('returns plain output for an unrecognized non-zero exit', async () => {
    await fakeBin('gcloud', 'echo boom 1>&2; exit 2');
    process.env.PATH = bin;
    const r = await runGcp('gcloud', ['logging', 'read']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('boom');
    expect(r.message).toContain('exit code: 2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/gcpExec.test.ts`
Expected: FAIL — cannot resolve `./gcpExec.js`.

- [ ] **Step 3: Write the helper**

`src/tools/gcpExec.ts`:

```ts
// Shared runner for the read-only gcloud/kubectl debug tools.
type Binary = 'gcloud' | 'kubectl';

export interface GcpExecResult {
  ok: boolean; // false => map to an isError ToolResult
  message: string;
}

const MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT = 120_000;

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_BYTES) return s;
  return (
    s.slice(0, MAX_OUTPUT_BYTES) +
    `\n\n[... output truncated at ${MAX_OUTPUT_BYTES} bytes ...]`
  );
}

const INSTALL_HINT: Record<Binary, string> = {
  gcloud:
    'gcloud not found. Install the Google Cloud SDK: ' +
    'https://cloud.google.com/sdk/docs/install',
  kubectl:
    'kubectl not found. Install kubectl: ' +
    'https://kubernetes.io/docs/tasks/tools/',
};

const AUTH_SIGNATURE: Record<Binary, RegExp> = {
  gcloud:
    /(not logged in|do not currently have active|reauthentication required|gcloud auth login|credentials|permission denied|unauthorized)/i,
  kubectl:
    /(unable to connect to the server|no such host|context .* does not exist|you must be logged in|the server has asked for the client to provide credentials|unauthorized)/i,
};

const AUTH_REMEDIATION: Record<Binary, string> = {
  gcloud:
    'gcloud authentication/permission problem. Run `gcloud auth login` (or ' +
    '`gcloud auth application-default login`) and verify the project, then retry.',
  kubectl:
    'kubectl cannot reach the cluster (auth or kube context). Run the ' +
    'gke_get_credentials tool first, or check your kube context, then retry.',
};

function isMissingBinary(err: unknown): boolean {
  const m = String((err as { message?: unknown })?.message ?? err);
  return /ENOENT|not found|No such file|executable/i.test(m);
}

export async function runGcp(
  binary: Binary,
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<GcpExecResult> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([binary, ...args], { stdout: 'pipe', stderr: 'pipe' });
  } catch (err) {
    if (isMissingBinary(err)) return { ok: false, message: INSTALL_HINT[binary] };
    return { ok: false, message: `Failed to start ${binary}: ${err}` };
  }

  const killer = setTimeout(() => {
    try {
      proc.kill(9);
    } catch {}
  }, timeoutMs);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  clearTimeout(killer);

  if (exitCode !== 0 && AUTH_SIGNATURE[binary].test(stderr)) {
    return {
      ok: false,
      message: `${AUTH_REMEDIATION[binary]}\n\n[stderr]\n${truncate(stderr)}`,
    };
  }

  const sections: string[] = [];
  if (stdout) sections.push(truncate(stdout));
  if (stderr) sections.push(`[stderr]\n${truncate(stderr)}`);
  sections.push(`[exit code: ${exitCode}]`);
  return { ok: true, message: sections.join('\n') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/gcpExec.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/gcpExec.ts src/tools/gcpExec.test.ts
git commit -m "feat(tools): runGcp helper with missing-binary/auth mapping"
```

---

### Task 7: `gke_get_credentials` tool

**Files:**
- Create: `src/tools/gke_get_credentials.ts`
- Test: `src/tools/gke_get_credentials.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tools/gke_get_credentials.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gkeGetCredentialsTool } from './gke_get_credentials.js';

let bin: string;
const origPath = process.env.PATH;

beforeEach(async () => {
  bin = await mkdtemp(join(tmpdir(), 'ma-bin-'));
  await writeFile(join(bin, 'gcloud'), '#!/bin/bash\necho "ARGS:$*"\nexit 0\n');
  await chmod(join(bin, 'gcloud'), 0o755);
  process.env.PATH = bin;
});

afterEach(async () => {
  process.env.PATH = origPath;
  await rm(bin, { recursive: true, force: true });
});

describe('gkeGetCredentialsTool', () => {
  it('builds the correct gcloud argv', async () => {
    const r = await gkeGetCredentialsTool.execute({
      cluster: 'prod', project: 'my-proj', location: 'us-central1',
    });
    expect(r.isError).toBeFalsy();
    const text = r.content as string;
    expect(text).toContain('container clusters get-credentials prod');
    expect(text).toContain('--project my-proj');
    expect(text).toContain('--region us-central1');
  });

  it('uses --zone for a zonal location', async () => {
    const r = await gkeGetCredentialsTool.execute({
      cluster: 'prod', project: 'p', location: 'us-central1-a',
    });
    expect(r.content as string).toContain('--zone us-central1-a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/gke_get_credentials.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the tool**

`src/tools/gke_get_credentials.ts`:

```ts
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  cluster: z.string().describe('GKE cluster name'),
  project: z.string().describe('GCP project id'),
  location: z
    .string()
    .describe('Cluster region (e.g. us-central1) or zone (e.g. us-central1-a)'),
});

// A zone has three dash-separated segments (region + zone suffix).
function isZone(location: string): boolean {
  return location.split('-').length >= 3;
}

export const gkeGetCredentialsTool: Tool = {
  name: 'gke_get_credentials',
  description:
    'Fetch GKE cluster credentials and set the kube context ' +
    '(read-only; wraps `gcloud container clusters get-credentials`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { cluster, project, location } = paramsSchema.parse(params);
    const locFlag = isZone(location) ? '--zone' : '--region';
    const r = await runGcp('gcloud', [
      'container', 'clusters', 'get-credentials', cluster,
      '--project', project,
      locFlag, location,
    ]);
    return { content: r.message, isError: !r.ok };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/gke_get_credentials.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/gke_get_credentials.ts src/tools/gke_get_credentials.test.ts
git commit -m "feat(tools): gke_get_credentials"
```

---

### Task 8: `gcloud_logging` tool

**Files:**
- Create: `src/tools/gcloud_logging.ts`
- Test: `src/tools/gcloud_logging.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tools/gcloud_logging.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/gcloud_logging.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the tool**

`src/tools/gcloud_logging.ts`:

```ts
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  filter: z.string().describe('Cloud Logging filter expression'),
  project: z.string().describe('GCP project id'),
  limit: z.number().int().positive().optional().describe('Max entries (default 50)'),
  freshness: z
    .string()
    .optional()
    .describe('Only entries newer than this, e.g. 1h, 30m, 2d (default 1h)'),
});

export const gcloudLoggingTool: Tool = {
  name: 'gcloud_logging',
  description:
    'Read entries from GCP Cloud Logging (read-only; wraps ' +
    '`gcloud logging read --format=json`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { filter, project, limit, freshness } = paramsSchema.parse(params);
    const r = await runGcp('gcloud', [
      'logging', 'read', filter,
      '--project', project,
      '--format=json',
      '--limit', String(limit ?? 50),
      '--freshness', freshness ?? '1h',
    ]);
    return { content: r.message, isError: !r.ok };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/gcloud_logging.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/gcloud_logging.ts src/tools/gcloud_logging.test.ts
git commit -m "feat(tools): gcloud_logging"
```

---

### Task 9: `kubectl_get` tool

**Files:**
- Create: `src/tools/kubectl_get.ts`
- Test: `src/tools/kubectl_get.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tools/kubectl_get.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { kubectlGetTool } from './kubectl_get.js';

let bin: string;
const origPath = process.env.PATH;

beforeEach(async () => {
  bin = await mkdtemp(join(tmpdir(), 'ma-bin-'));
  await writeFile(join(bin, 'kubectl'), '#!/bin/bash\necho "ARGS:$*"\nexit 0\n');
  await chmod(join(bin, 'kubectl'), 0o755);
  process.env.PATH = bin;
});

afterEach(async () => {
  process.env.PATH = origPath;
  await rm(bin, { recursive: true, force: true });
});

describe('kubectlGetTool', () => {
  it('builds get with name, namespace and json output', async () => {
    const r = await kubectlGetTool.execute({
      resource: 'pods', name: 'svc-abc', namespace: 'prod', output: 'json',
    });
    expect(r.content as string).toContain(
      'ARGS:get pods svc-abc -n prod -o json',
    );
  });

  it('defaults output to wide and omits name when not given', async () => {
    const r = await kubectlGetTool.execute({ resource: 'services' });
    expect(r.content as string).toContain('ARGS:get services -o wide');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/kubectl_get.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the tool**

`src/tools/kubectl_get.ts`:

```ts
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  resource: z
    .string()
    .describe('Resource type, e.g. pods, services, deployments'),
  name: z.string().optional().describe('Specific resource name (optional)'),
  namespace: z.string().optional().describe('Namespace (optional)'),
  output: z
    .enum(['wide', 'json'])
    .optional()
    .describe('Output format (default wide)'),
});

export const kubectlGetTool: Tool = {
  name: 'kubectl_get',
  description:
    'List/inspect Kubernetes resources (read-only; wraps `kubectl get`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { resource, name, namespace, output } = paramsSchema.parse(params);
    const args = ['get', resource];
    if (name) args.push(name);
    if (namespace) args.push('-n', namespace);
    args.push('-o', output ?? 'wide');
    const r = await runGcp('kubectl', args);
    return { content: r.message, isError: !r.ok };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/kubectl_get.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/kubectl_get.ts src/tools/kubectl_get.test.ts
git commit -m "feat(tools): kubectl_get"
```

---

### Task 10: `kubectl_describe` tool

**Files:**
- Create: `src/tools/kubectl_describe.ts`
- Test: `src/tools/kubectl_describe.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tools/kubectl_describe.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { kubectlDescribeTool } from './kubectl_describe.js';

let bin: string;
const origPath = process.env.PATH;

beforeEach(async () => {
  bin = await mkdtemp(join(tmpdir(), 'ma-bin-'));
  await writeFile(join(bin, 'kubectl'), '#!/bin/bash\necho "ARGS:$*"\nexit 0\n');
  await chmod(join(bin, 'kubectl'), 0o755);
  process.env.PATH = bin;
});

afterEach(async () => {
  process.env.PATH = origPath;
  await rm(bin, { recursive: true, force: true });
});

describe('kubectlDescribeTool', () => {
  it('builds describe with namespace', async () => {
    const r = await kubectlDescribeTool.execute({
      resource: 'pod', name: 'svc-abc', namespace: 'prod',
    });
    expect(r.content as string).toContain('ARGS:describe pod svc-abc -n prod');
  });

  it('omits namespace flag when not given', async () => {
    const r = await kubectlDescribeTool.execute({ resource: 'pod', name: 'p1' });
    expect(r.content as string).toContain('ARGS:describe pod p1');
    expect(r.content as string).not.toContain('-n ');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/kubectl_describe.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the tool**

`src/tools/kubectl_describe.ts`:

```ts
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  resource: z.string().describe('Resource type, e.g. pod, deployment, service'),
  name: z.string().describe('Resource name'),
  namespace: z.string().optional().describe('Namespace (optional)'),
});

export const kubectlDescribeTool: Tool = {
  name: 'kubectl_describe',
  description:
    'Show detailed state and events for a Kubernetes resource ' +
    '(read-only; wraps `kubectl describe`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { resource, name, namespace } = paramsSchema.parse(params);
    const args = ['describe', resource, name];
    if (namespace) args.push('-n', namespace);
    const r = await runGcp('kubectl', args);
    return { content: r.message, isError: !r.ok };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/kubectl_describe.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/kubectl_describe.ts src/tools/kubectl_describe.test.ts
git commit -m "feat(tools): kubectl_describe"
```

---

### Task 11: `kubectl_logs` tool

**Files:**
- Create: `src/tools/kubectl_logs.ts`
- Test: `src/tools/kubectl_logs.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tools/kubectl_logs.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { kubectlLogsTool } from './kubectl_logs.js';

let bin: string;
const origPath = process.env.PATH;

beforeEach(async () => {
  bin = await mkdtemp(join(tmpdir(), 'ma-bin-'));
  await writeFile(join(bin, 'kubectl'), '#!/bin/bash\necho "ARGS:$*"\nexit 0\n');
  await chmod(join(bin, 'kubectl'), 0o755);
  process.env.PATH = bin;
});

afterEach(async () => {
  process.env.PATH = origPath;
  await rm(bin, { recursive: true, force: true });
});

describe('kubectlLogsTool', () => {
  it('builds logs with all options', async () => {
    const r = await kubectlLogsTool.execute({
      pod: 'svc-abc', namespace: 'prod', container: 'app',
      tail: 200, previous: true,
    });
    expect(r.content as string).toContain(
      'ARGS:logs svc-abc -n prod --container app --tail 200 --previous',
    );
  });

  it('builds minimal logs invocation', async () => {
    const r = await kubectlLogsTool.execute({ pod: 'p1' });
    expect(r.content as string).toContain('ARGS:logs p1 --tail 200');
    expect(r.content as string).not.toContain('--previous');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/kubectl_logs.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the tool**

`src/tools/kubectl_logs.ts`:

```ts
import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { runGcp } from './gcpExec.js';

const paramsSchema = z.object({
  pod: z.string().describe('Pod name'),
  namespace: z.string().optional().describe('Namespace (optional)'),
  container: z.string().optional().describe('Container name (optional)'),
  tail: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Number of trailing lines (default 200)'),
  previous: z
    .boolean()
    .optional()
    .describe('Logs from the previous (crashed) container instance'),
});

export const kubectlLogsTool: Tool = {
  name: 'kubectl_logs',
  description:
    'Fetch logs from a Kubernetes pod (read-only; wraps `kubectl logs`).',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { pod, namespace, container, tail, previous } =
      paramsSchema.parse(params);
    const args = ['logs', pod];
    if (namespace) args.push('-n', namespace);
    if (container) args.push('--container', container);
    args.push('--tail', String(tail ?? 200));
    if (previous) args.push('--previous');
    const r = await runGcp('kubectl', args);
    return { content: r.message, isError: !r.ok };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/kubectl_logs.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/kubectl_logs.ts src/tools/kubectl_logs.test.ts
git commit -m "feat(tools): kubectl_logs"
```

---

### Task 12: Register the GCP tools

**Files:**
- Modify: `src/tools/index.ts`
- Test: `src/tools/index.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tools/index.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { getToolByName, getTools } from './index.js';

describe('tool registry', () => {
  it('registers the GCP debug tools', () => {
    for (const n of [
      'gke_get_credentials',
      'gcloud_logging',
      'kubectl_get',
      'kubectl_describe',
      'kubectl_logs',
    ]) {
      expect(getToolByName(n)?.name).toBe(n);
    }
  });

  it('still registers the core tools', () => {
    const names = getTools().map(t => t.name);
    expect(names).toContain('bash');
    expect(names).toContain('skill');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/index.test.ts`
Expected: FAIL — GCP tools not registered.

- [ ] **Step 3: Register the tools**

In `src/tools/index.ts`, add imports after the existing `mcpTool` import:

```ts
import { gkeGetCredentialsTool } from './gke_get_credentials.js';
import { gcloudLoggingTool } from './gcloud_logging.js';
import { kubectlGetTool } from './kubectl_get.js';
import { kubectlDescribeTool } from './kubectl_describe.js';
import { kubectlLogsTool } from './kubectl_logs.js';
```

Then add them to the `tools` array, after `mcpTool,`:

```ts
  mcpTool,
  gkeGetCredentialsTool,
  gcloudLoggingTool,
  kubectlGetTool,
  kubectlDescribeTool,
  kubectlLogsTool,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/index.ts src/tools/index.test.ts
git commit -m "feat(tools): register GCP debug tools in the registry"
```

---

### Task 13: Full verification & docs

**Files:**
- Modify: `docs/self-configure.md`

- [ ] **Step 1: Run the whole test suite**

Run: `bun test`
Expected: all tests pass (including the new skill/tool tests). If any fail, fix
before continuing.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors. (If `*.md` import attributes error, confirm
`src/skills/skills.d.ts` exists and is under `src/**/*`.)

- [ ] **Step 3: Build smoke test (verifies embedded markdown)**

Run: `bun run build && ./dist/minimal-agent-linux-x64 --version`
Expected: prints a version line and exits 0 (confirms `--compile` embeds the
`.md` text imports without a runtime filesystem dependency).

- [ ] **Step 4: Document the built-in skills & env vars**

Append to `docs/self-configure.md`:

```markdown

## Built-in debugging skills

`minimal-agent` ships two built-in skills (invoke via the `skill` tool, or
list them with the `/skills` command). A file of the same name under
`~/.claude/skills/<name>/` overrides the built-in.

- **gke-service-debug** — debug a GKE service. Reads env vars `GKE_PROJECT`,
  `GKE_CLUSTER`, `GKE_LOCATION`, optional `SERVICE_REPO_PATH`, and optional
  MySQL vars; asks interactively when unset. Uses ambient `gcloud`/`kubectl`
  auth.
- **transaction-flow-debug** — investigate a failed transaction by
  `transaction_id`. Reads `MYSQL_DSN` (or `MYSQL_HOST`/`MYSQL_PORT`/
  `MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE`); read-only queries only.

Both rely on `gcloud`/`kubectl`/`mysql` being installed and authenticated;
missing tools or credentials produce an actionable error.
```

- [ ] **Step 5: Commit**

```bash
git add docs/self-configure.md
git commit -m "docs: document built-in debugging skills and env vars"
```

---

## Self-Review Notes

- **Spec coverage:** built-in bundling + embed (Tasks 1–3), user override + resolution (Task 4), listing/dedupe (Task 5), `runGcp` with missing-binary/auth/truncation/timeout (Task 6), five focused read-only verbs (Tasks 7–11), registry (Task 12), env-var/`ask_user` resolution and read-only MySQL discipline are in the playbook text (Tasks 1–2), docs + embed verification (Task 13). No mutating verbs are introduced.
- **Type consistency:** `runGcp(binary, args, timeoutMs?) → { ok, message }`; every tool maps `{ content: r.message, isError: !r.ok }`. `Skill = { name, description, content }` matches `src/types.ts`. `getBuiltinSkill` used by Task 4 is defined in Task 3.
- **No placeholders:** every code/test step is complete and runnable.
