// Helper to produce unified diffs for file_edit / file_write tools.
// Uses npm `diff` (createPatch) to generate standard unified-diff output
// that our markdown renderer already knows how to display.

import { createPatch } from 'diff'
import { basename } from 'path'

/**
 * Produce a unified diff patch for a single file change.
 * Returns undefined when there's no meaningful change (identical content).
 */
export function makeUnifiedDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
): string | undefined {
  if (oldContent === newContent) return undefined
  const name = basename(filePath)
  const patch = createPatch(name, oldContent, newContent, '', '', { context: 3 })
  // createPatch includes "Index: ..." header + "==..." line we don't need.
  // Strip the first two lines if present.
  const lines = patch.split('\n')
  while (
    lines.length > 0 &&
    (lines[0].startsWith('Index:') || /^=+$/.test(lines[0]))
  ) {
    lines.shift()
  }
  return lines.join('\n')
}
