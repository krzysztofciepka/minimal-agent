// Shared runner for the read-only gcloud/kubectl debug tools.
type Binary = 'gcloud' | 'kubectl';

export interface GcpExecResult {
  ok: boolean; // false => map to an isError ToolResult
  message: string;
}

const MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT = 120_000;
const READ_GRACE_MS = 500; // bound stream reads after the process is killed

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

// Matched only against stderr when the process exited non-zero. Kept specific
// to real gcloud/kubectl auth/context failures so an unrelated error (e.g. a
// local "Permission denied" filesystem error) is not masked by a canned hint.
const AUTH_SIGNATURE: Record<Binary, RegExp> = {
  gcloud:
    /(do not currently have an? active account|do not currently have active credentials|reauthentication required|gcloud auth login|application default credentials were not found|invalid_grant|caller does not have permission|does not have [\w.]+ permission|PERMISSION_DENIED|not logged in)/i,
  kubectl:
    /(unable to connect to the server|connection to the server .* (?:was )?refused|no such host|context .* (?:does not exist|not found)|you must be logged in|the server has asked for the client to provide credentials|couldn't get current server API group)/i,
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
  const m = err instanceof Error ? err.message : String(err);
  return /ENOENT|not found|No such file|executable/i.test(m);
}

export async function runGcp(
  binary: Binary,
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<GcpExecResult> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([binary, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    });
  } catch (err) {
    if (isMissingBinary(err)) return { ok: false, message: INSTALL_HINT[binary] };
    return { ok: false, message: `Failed to start ${binary}: ${err}` };
  }

  let timedOut = false;
  const killer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill(9);
    } catch {}
  }, timeoutMs);

  // proc.exited resolves promptly once the process is killed. The stdout/stderr
  // streams can stay open if a grandchild inherited the pipe, so the reads are
  // raced against a short grace period to keep wall-clock bounded.
  const readP = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  clearTimeout(killer);

  const empty: [string, string] = ['', ''];
  const [stdout, stderr] = await Promise.race([
    readP,
    new Promise<[string, string]>(resolve =>
      setTimeout(() => resolve(empty), READ_GRACE_MS),
    ),
  ]);

  if (timedOut) {
    const tail = stderr ? `\n\n[stderr]\n${truncate(stderr)}` : '';
    return {
      ok: false,
      message: `${binary} timed out after ${timeoutMs}ms and was killed.${tail}`,
    };
  }

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
