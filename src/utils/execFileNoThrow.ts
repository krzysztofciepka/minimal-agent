import { promisify } from 'util'
import { execFile as execFileCb } from 'child_process'

const execFileAsync = promisify(execFileCb)

export async function execFileNoThrow(
  file: string,
  args: string[] = [],
  options: Record<string, unknown> = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, options as any)
    return { stdout: String(stdout), stderr: String(stderr), code: 0 }
  } catch (err: any) {
    return {
      stdout: String(err?.stdout ?? ''),
      stderr: String(err?.stderr ?? ''),
      code: typeof err?.code === 'number' ? err.code : 1,
    }
  }
}
