#!/usr/bin/env bun
/**
 * Build script for minimal-agent.
 *
 * Produces standalone Bun-compiled binaries for the listed targets.
 *
 * Usage:
 *   bun run scripts/build.ts               # builds current platform only
 *   bun run scripts/build.ts --all         # builds all cross-platform targets
 *   bun run scripts/build.ts linux-x64     # builds a specific target
 */

import { mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { $ } from 'bun'

type Target = {
  name: string
  bunTarget: string
  binaryName: string
}

const TARGETS: Target[] = [
  {
    name: 'linux-x64',
    bunTarget: 'bun-linux-x64',
    binaryName: 'minimal-agent-linux-x64',
  },
  {
    name: 'linux-arm64',
    bunTarget: 'bun-linux-arm64',
    binaryName: 'minimal-agent-linux-arm64',
  },
  {
    name: 'darwin-x64',
    bunTarget: 'bun-darwin-x64',
    binaryName: 'minimal-agent-darwin-x64',
  },
  {
    name: 'darwin-arm64',
    bunTarget: 'bun-darwin-arm64',
    binaryName: 'minimal-agent-darwin-arm64',
  },
  {
    name: 'windows-x64',
    bunTarget: 'bun-windows-x64',
    binaryName: 'minimal-agent-windows-x64.exe',
  },
]

function detectCurrentTarget(): Target {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const platformMap: Record<string, string> = {
    linux: 'linux',
    darwin: 'darwin',
    win32: 'windows',
  }
  const platform = platformMap[process.platform] ?? 'linux'
  const name = `${platform}-${arch}`
  const match = TARGETS.find((t) => t.name === name)
  if (!match) {
    throw new Error(`Unsupported current platform: ${name}`)
  }
  return match
}

async function build(target: Target, outDir: string): Promise<void> {
  const outPath = `${outDir}/${target.binaryName}`
  console.log(`  → ${target.name}  (${target.bunTarget})`)

  await $`bun build ./src/cli.ts \
    --compile \
    --target=${target.bunTarget} \
    --outfile=${outPath} \
    --minify`.quiet()

  console.log(`    ✓ ${outPath}`)
}

async function main() {
  const args = process.argv.slice(2)
  const outDir = 'dist'

  if (existsSync(outDir)) {
    await rm(outDir, { recursive: true, force: true })
  }
  await mkdir(outDir, { recursive: true })

  let targets: Target[]

  if (args.includes('--all')) {
    targets = TARGETS
  } else if (args.length > 0) {
    targets = args
      .filter((a) => !a.startsWith('--'))
      .map((name) => {
        const t = TARGETS.find((x) => x.name === name)
        if (!t) {
          console.error(`Unknown target: ${name}`)
          console.error(`Available: ${TARGETS.map((x) => x.name).join(', ')}`)
          process.exit(1)
        }
        return t
      })
    if (targets.length === 0) {
      targets = [detectCurrentTarget()]
    }
  } else {
    targets = [detectCurrentTarget()]
  }

  console.log(`Building ${targets.length} target(s) into ./${outDir}/`)
  const start = Date.now()

  for (const target of targets) {
    try {
      await build(target, outDir)
    } catch (err: any) {
      console.error(`    ✗ ${target.name} failed: ${err?.message ?? err}`)
      process.exitCode = 1
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\nDone in ${elapsed}s`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
