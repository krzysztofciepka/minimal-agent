/**
 * TUI Entry Point
 *
 * Launches the terminal UI using OpenClaude's custom Ink rendering engine.
 */

import * as React from 'react'
import { createRoot } from './ink/root.js'
import { REPL } from './components/REPL.js'

export async function startTUI() {
  const root = await createRoot({
    exitOnCtrlC: true,
    patchConsole: true,
  })

  root.render(<REPL />)
}

// Only run if called directly
if (import.meta.main) {
  startTUI().catch((error) => {
    console.error('Failed to start TUI:', error)
    process.exit(1)
  })
}