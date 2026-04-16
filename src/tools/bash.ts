// Bash tool - execute a shell command
import { z } from 'zod'
import type { Tool, ToolResult } from '../types.js'

const paramsSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  cwd: z.string().optional().describe('Working directory (optional)'),
  timeout_ms: z
    .number()
    .optional()
    .describe('Timeout in milliseconds (default 120000)'),
})

const DEFAULT_TIMEOUT = 120_000
const MAX_OUTPUT_BYTES = 256 * 1024

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_BYTES) return s
  return (
    s.slice(0, MAX_OUTPUT_BYTES) +
    `\n\n[... output truncated at ${MAX_OUTPUT_BYTES} bytes ...]`
  )
}

export const bashTool: Tool = {
  name: 'bash',
  description:
    'Execute a shell command via /bin/bash -c. Returns stdout + stderr and exit code.',
  parameters: paramsSchema,
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { command, cwd, timeout_ms } = paramsSchema.parse(params)
    const timeout = timeout_ms ?? DEFAULT_TIMEOUT

    try {
      const proc = Bun.spawn(['/bin/bash', '-lc', command], {
        cwd: cwd ? cwd : process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const killer = setTimeout(() => {
        try {
          proc.kill(9)
        } catch {}
      }, timeout)

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const exitCode = await proc.exited
      clearTimeout(killer)

      const sections: string[] = []
      if (stdout) sections.push(truncate(stdout))
      if (stderr) sections.push(`[stderr]\n${truncate(stderr)}`)
      sections.push(`[exit code: ${exitCode}]`)

      return {
        content: sections.join('\n'),
        isError: exitCode !== 0,
      }
    } catch (error: any) {
      return {
        content: `Error executing command: ${error?.message ?? String(error)}`,
        isError: true,
      }
    }
  },
}
