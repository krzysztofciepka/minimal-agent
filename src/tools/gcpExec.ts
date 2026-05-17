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
    proc = Bun.spawn([binary, ...args], { stdout: 'pipe', stderr: 'pipe', env: process.env });
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
