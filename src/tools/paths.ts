// Shared helpers for tool paths.
import { homedir } from 'os'
import { resolve } from 'path'

/**
 * Expand a user-supplied path:
 *  - "~"        → home dir
 *  - "~/foo"    → <home>/foo
 *  - "~user/x"  → left as-is (we don't look up other users)
 *  - relative   → resolved from process.cwd()
 */
export function expandPath(p: string): string {
  if (!p) return p
  let out = p.trim()
  if (out === '~') {
    out = homedir()
  } else if (out.startsWith('~/')) {
    out = homedir() + out.slice(1)
  }
  return resolve(out)
}
