// Minimal markdown → ANSI renderer for terminal display.
//
// Parses markdown via `marked`, syntax-highlights fenced code blocks with
// `cli-highlight`, and emits an ANSI string suitable for the Ink <Ansi> component.
//
// Simplified from OpenClaude's utils/markdown.ts — no tables, no theme system,
// no OSC 8 hyperlinks, no blockquote figures. Just the common cases.

import chalk from 'chalk'
import { marked, type Token } from 'marked'
import { highlight, supportsLanguage } from 'cli-highlight'

const EOL = '\n'

let configured = false
function configureMarked(): void {
  if (configured) return
  configured = true
  // Disable strikethrough — models use ~ for "approximate" more often than del
  marked.use({
    tokenizer: {
      del() {
        return undefined
      },
    },
  })
}

function highlightCode(code: string, lang: string | undefined): string {
  if (!lang) return code
  const language = supportsLanguage(lang) ? lang : 'plaintext'
  try {
    return highlight(code, { language, ignoreIllegals: true })
  } catch {
    return code
  }
}

// Diff rendering — port of OpenClaude's gutter+background layout, simplified.
// Output: ANSI string where each line has
//   [red/green/dim bg][ lineNum ][ +/- ][ content ]
// The <Ansi> component turns this into Text segments.
const DIFF_BG_ADD = chalk.bgRgb(0, 64, 0)
const DIFF_BG_DEL = chalk.bgRgb(80, 0, 0)
const DIFF_FG_ADD = chalk.rgb(152, 255, 152)
const DIFF_FG_DEL = chalk.rgb(255, 152, 152)
const DIFF_GUTTER_DIM = chalk.dim

interface DiffLine {
  marker: '+' | '-' | ' '
  oldLine: number | null
  newLine: number | null
  content: string
}

function parseDiff(text: string): DiffLine[] {
  const out: DiffLine[] = []
  const lines = text.split('\n')
  let oldLine = 1
  let newLine = 1
  let inHunk = false

  const hunkRe = /^@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/

  for (const raw of lines) {
    const m = hunkRe.exec(raw)
    if (m) {
      oldLine = parseInt(m[1], 10)
      newLine = parseInt(m[2], 10)
      inHunk = true
      continue
    }
    // Skip file headers: '--- a/file', '+++ b/file', 'diff --git ...', 'index ...'
    if (
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ') ||
      raw.startsWith('diff ') ||
      raw.startsWith('index ')
    ) {
      continue
    }

    if (!inHunk && raw.length === 0) continue

    const first = raw[0]
    if (first === '+') {
      out.push({ marker: '+', oldLine: null, newLine, content: raw.slice(1) })
      newLine++
    } else if (first === '-') {
      out.push({ marker: '-', oldLine, newLine: null, content: raw.slice(1) })
      oldLine++
    } else if (first === ' ' || !inHunk) {
      const body = first === ' ' ? raw.slice(1) : raw
      out.push({ marker: ' ', oldLine, newLine, content: body })
      oldLine++
      newLine++
    }
  }
  return out
}

export function renderDiff(text: string): string {
  const lines = parseDiff(text)
  if (lines.length === 0) return text

  // Counts for the header
  const added = lines.filter((l) => l.marker === '+').length
  const removed = lines.filter((l) => l.marker === '-').length

  // Gutter width = widest line number
  const maxLine = lines.reduce((acc, l) => {
    return Math.max(acc, l.oldLine ?? 0, l.newLine ?? 0)
  }, 0)
  const numW = Math.max(2, String(maxLine).length)

  const header = chalk.bold(
    `Added ${added} line${added === 1 ? '' : 's'}, removed ${removed} line${removed === 1 ? '' : 's'}`,
  )

  const body = lines
    .map((l) => {
      const shownLine =
        l.marker === '-' ? l.oldLine! : l.marker === '+' ? l.newLine! : l.newLine!
      const num = String(shownLine).padStart(numW)
      if (l.marker === '+') {
        return (
          DIFF_BG_ADD(DIFF_FG_ADD(` ${num} `)) +
          DIFF_BG_ADD(DIFF_FG_ADD('+ ')) +
          DIFF_BG_ADD(l.content)
        )
      }
      if (l.marker === '-') {
        return (
          DIFF_BG_DEL(DIFF_FG_DEL(` ${num} `)) +
          DIFF_BG_DEL(DIFF_FG_DEL('- ')) +
          DIFF_BG_DEL(l.content)
        )
      }
      return DIFF_GUTTER_DIM(` ${num}   `) + l.content
    })
    .join(EOL)

  return `${header}${EOL}${body}`
}

function formatToken(
  token: Token,
  listDepth = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
): string {
  switch (token.type) {
    case 'blockquote': {
      const inner = (token.tokens ?? [])
        .map((t) => formatToken(t, 0, null, token))
        .join('')
      const bar = chalk.dim('│')
      return inner
        .split(EOL)
        .map((line) => (line.trim() ? `${bar} ${chalk.italic(line)}` : line))
        .join(EOL)
    }

    case 'code': {
      const t = token as { text: string; lang?: string }
      if (t.lang === 'diff' || t.lang === 'patch') {
        return renderDiff(t.text) + EOL
      }
      const body = highlightCode(t.text, t.lang)
      const label = t.lang
        ? chalk.dim(`┌─ ${t.lang} ${'─'.repeat(Math.max(0, 60 - t.lang.length - 4))}`)
        : chalk.dim('┌' + '─'.repeat(62))
      const footer = chalk.dim('└' + '─'.repeat(62))
      return `${label}${EOL}${body}${EOL}${footer}${EOL}`
    }

    case 'codespan':
      return chalk.bgBlackBright.whiteBright(` ${(token as { text: string }).text} `)

    case 'em':
      return chalk.italic(
        ((token as any).tokens ?? [])
          .map((t: Token) => formatToken(t, 0, null, parent))
          .join(''),
      )

    case 'strong':
      return chalk.bold(
        ((token as any).tokens ?? [])
          .map((t: Token) => formatToken(t, 0, null, parent))
          .join(''),
      )

    case 'heading': {
      const t = token as { depth: number; tokens?: Token[] }
      const inner = (t.tokens ?? []).map((x) => formatToken(x, 0, null, null)).join('')
      if (t.depth === 1) return chalk.bold.underline.cyanBright(inner) + EOL + EOL
      if (t.depth === 2) return chalk.bold.cyan(inner) + EOL + EOL
      return chalk.bold(inner) + EOL + EOL
    }

    case 'hr':
      return chalk.dim('─'.repeat(60)) + EOL

    case 'link': {
      const t = token as { href: string; tokens?: Token[] }
      const inner = (t.tokens ?? []).map((x) => formatToken(x, 0, null, token)).join('')
      const label = inner || t.href
      return chalk.blue.underline(label) + chalk.dim(` (${t.href})`)
    }

    case 'list': {
      const t = token as { items: Token[]; ordered: boolean; start: number }
      return t.items
        .map((item, index) =>
          formatToken(item, listDepth, t.ordered ? t.start + index : null, token),
        )
        .join('')
    }

    case 'list_item': {
      const t = token as { tokens?: Token[] }
      const bullet = orderedListNumber === null ? '•' : `${orderedListNumber}.`
      const indent = '  '.repeat(listDepth)
      const body = (t.tokens ?? [])
        .map((x) => formatToken(x, listDepth + 1, orderedListNumber, token))
        .join('')
      return `${indent}${chalk.cyan(bullet)} ${body.trimEnd()}${EOL}`
    }

    case 'paragraph': {
      const t = token as { tokens?: Token[] }
      return (
        (t.tokens ?? []).map((x) => formatToken(x, 0, null, null)).join('') + EOL
      )
    }

    case 'space':
      return EOL

    case 'br':
      return EOL

    case 'text': {
      const t = token as { text: string; tokens?: Token[] }
      if (t.tokens) {
        return t.tokens
          .map((x) => formatToken(x, listDepth, orderedListNumber, parent))
          .join('')
      }
      return t.text
    }

    case 'image': {
      const t = token as { href: string; text: string }
      return chalk.dim(`[image: ${t.text || t.href}]`)
    }

    default:
      return (token as { raw?: string }).raw ?? ''
  }
}

export function renderMarkdown(content: string): string {
  if (!content) return ''
  configureMarked()
  try {
    return marked
      .lexer(content)
      .map((t) => formatToken(t))
      .join('')
      .trimEnd()
  } catch {
    return content
  }
}
