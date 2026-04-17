/**
 * REPL Component - Minimal-Agent TUI
 *
 * Uses OpenClaude's Ink rendering engine with minimal-agent's API client.
 */

import * as React from 'react'
import { useState, useCallback, useEffect, useContext, useRef } from 'react'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import Box from '../ink/components/Box.js'
import Text from '../ink/components/Text.js'
import useInput from '../ink/hooks/use-input.js'
import useApp from '../ink/hooks/use-app.js'
import { TerminalSizeContext } from '../ink/components/TerminalSizeContext.js'
import { Ansi } from '../ink/Ansi.js'
import { apiClient } from '../client.js'
import { loadConfig } from '../config.js'
import { renderMarkdown } from '../utils/markdown.js'
import {
  handleHelp,
  handleModel,
  handleProvider,
  handleMcp,
  handleSkills,
  handleConfigCmd,
} from '../commands/index.js'
import type { Message, Config } from '../types.js'

const SKILLS_DIR = join(homedir(), '.claude', 'skills')

async function loadSkillContent(name: string): Promise<string | null> {
  try {
    const skillDir = join(SKILLS_DIR, name)
    const files = await readdir(skillDir)
    const mdFile = files.find((f) => f.endsWith('.md'))
    if (!mdFile) return null
    return await readFile(join(skillDir, mdFile), 'utf-8')
  } catch {
    return null
  }
}

const ASCII_ART_FULL = `  _  __     _        ____          _
 | |/ /_ __(_)___   / ___|___   __| | ___
 | ' /| '__| / __| | |   / _ \\ / _\` |/ _ \\
 | . \\| |  | \\__ \\ | |__| (_) | (_| |  __/
 |_|\\_\\_|  |_|___/  \\____\\___/ \\__,_|\\___|`

const ASCII_ART_COMPACT = `  _  __     _
 | |/ /_ __(_)___
 | ' /| '__| / __|
 | . \\| |  | \\__ \\
 |_|\\_\\_|  |_|___/  Code`

const ASCII_ART_TINY = 'Kris Code'

const FULL_BANNER_WIDTH = 42
const COMPACT_BANNER_WIDTH = 24

type DisplayMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

async function buildEnvContext(): Promise<string> {
  const { homedir, userInfo, platform, release } = await import('os')
  let user = ''
  try {
    user = userInfo().username
  } catch {}
  return [
    '# Environment',
    `- User: ${user || 'unknown'}`,
    `- Home directory: ${homedir()}`,
    `- Working directory: ${process.cwd()}`,
    `- Platform: ${platform()} ${release()}`,
    '',
    'Use these absolute paths instead of guessing "~" expansion or paths like /root.',
  ].join('\n')
}

async function buildSystemPreamble(): Promise<string> {
  try {
    const { readFile } = await import('fs/promises')
    const { homedir } = await import('os')

    let claudeMd = ''
    let agentsMd = ''

    try {
      claudeMd = await readFile(`${homedir()}/CLAUDE.md`, 'utf-8')
    } catch {}

    try {
      agentsMd = await readFile(`${homedir()}/AGENTS.md`, 'utf-8')
    } catch {}

    const parts: string[] = [await buildEnvContext()]
    if (claudeMd) parts.push(`# CLAUDE.md\n${claudeMd}`)
    if (agentsMd) parts.push(`# AGENTS.md\n${agentsMd}`)
    return parts.join('\n\n---\n\n')
  } catch {
    return ''
  }
}

export function REPL(): React.ReactElement {
  const { exit } = useApp()
  const terminalSize = useContext(TerminalSizeContext)
  const [config, setConfig] = useState<Config | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const savedDraft = useRef<string>('')

  useEffect(() => {
    async function init() {
      try {
        await apiClient.init()
        const cfg = await loadConfig()
        setConfig(cfg)

        const preamble = await buildSystemPreamble()
        if (preamble) {
          setMessages([{ role: 'system', content: preamble }])
        }

        setInitialized(true)
      } catch (err: any) {
        setDisplayMessages((prev) => [
          ...prev,
          { role: 'system', content: `Init error: ${err?.message ?? String(err)}` },
        ])
        setInitialized(true)
      }
    }
    void init()
  }, [])

  const sendToLLM = useCallback(
    async (promptBody: string, displayText: string) => {
      setDisplayMessages((prev) => [...prev, { role: 'user', content: displayText }])
      setIsLoading(true)

      try {
        const newMessages: Message[] = [
          ...messages,
          { role: 'user', content: promptBody },
        ]

        const result = await apiClient.chatWithTools(newMessages, {
          onToolCall: (exec) => {
            const preview =
              exec.args.length > 120 ? exec.args.slice(0, 117) + '...' : exec.args
            setDisplayMessages((prev) => [
              ...prev,
              {
                role: 'system',
                content: `⚙  ${exec.name}(${preview})${exec.result.isError ? ' — error' : ''}`,
              },
            ])
          },
        })

        const assistantContent =
          typeof result.message.content === 'string'
            ? result.message.content
            : JSON.stringify(result.message.content)

        setMessages(result.messages)
        setDisplayMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent || '(no content)' },
        ])
      } catch (err: any) {
        setDisplayMessages((prev) => [
          ...prev,
          { role: 'system', content: `Error: ${err?.message ?? String(err)}` },
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [messages]
  )

  const handleSubmit = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      setHistory((h) => (h[h.length - 1] === trimmed ? h : [...h, trimmed]))
      setHistoryIndex(-1)
      savedDraft.current = ''

      if (trimmed.startsWith('/')) {
        const parts = trimmed.slice(1).split(/\s+/)
        const cmd = parts[0]
        const args = parts.slice(1)

        const pushSystem = (content: string) => {
          setDisplayMessages((prev) => [...prev, { role: 'system', content }])
        }

        switch (cmd) {
          case 'exit':
          case 'quit':
            exit()
            return
          case 'clear':
            setMessages((prev) => prev.filter((m) => m.role === 'system'))
            setDisplayMessages([])
            return
          case 'help':
            pushSystem(handleHelp())
            return
          case 'model': {
            const result = await handleModel(args)
            pushSystem(result)
            if (args.length > 0 && !result.startsWith('Model not')) {
              apiClient.setModel(args[0])
              setConfig((c) => (c ? { ...c, active_model: args[0] } : c))
            }
            return
          }
          case 'provider': {
            const result = await handleProvider(args)
            pushSystem(result)
            if (args.length > 0 && !result.startsWith('Provider not')) {
              setConfig((c) => (c ? { ...c, active_provider: args[0] } : c))
            }
            return
          }
          case 'mcp':
            pushSystem(await handleMcp(args))
            return
          case 'skills':
            pushSystem(await handleSkills())
            return
          case 'config':
            pushSystem(await handleConfigCmd(args))
            return
          default: {
            const skillContent = await loadSkillContent(cmd)
            if (skillContent) {
              pushSystem(`Invoking skill: ${cmd}${args.length ? ` ${args.join(' ')}` : ''}`)
              const fullInvocation = `/${cmd}${args.length ? ' ' + args.join(' ') : ''}`
              const header = args.length
                ? `The user invoked the "${cmd}" skill with arguments: ${args.join(' ')}\n` +
                  `Full invocation: ${fullInvocation}\n\n` +
                  `Follow the skill's instructions below. Treat the arguments as scope — ` +
                  `do not broaden the work beyond what the arguments specify. If the skill ` +
                  `is about operating on a specific item (e.g. "Task N"), work on that one ` +
                  `item only; do not read or modify unrelated items.`
                : `The user invoked the "${cmd}" skill with no arguments.\n\n` +
                  `Follow the skill's instructions below.`
              const skillInvocation = `${header}\n\n---\n\n${skillContent}`
              await sendToLLM(skillInvocation, fullInvocation)
              return
            }
            pushSystem(`Unknown command: /${cmd}. Type /help or /skills to see options.`)
            return
          }
        }
      }

      await sendToLLM(trimmed, trimmed)
    },
    [sendToLLM, exit]
  )

  useInput(
    (char, key) => {
      if (isLoading) return

      if (key.ctrl && char === 'c') {
        exit()
        return
      }

      if (key.return) {
        const toSubmit = input
        setInput('')
        setCursorPosition(0)
        void handleSubmit(toSubmit)
        return
      }

      if (key.backspace || key.delete) {
        if (cursorPosition > 0) {
          setInput(
            (prev) =>
              prev.slice(0, cursorPosition - 1) + prev.slice(cursorPosition)
          )
          setCursorPosition((p) => p - 1)
        }
        return
      }

      if (key.leftArrow) {
        setCursorPosition((p) => Math.max(0, p - 1))
        return
      }

      if (key.rightArrow) {
        setCursorPosition((p) => Math.min(input.length, p + 1))
        return
      }

      if (key.upArrow) {
        if (history.length === 0) return
        const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
        if (historyIndex === -1) savedDraft.current = input
        const recalled = history[nextIdx]
        setHistoryIndex(nextIdx)
        setInput(recalled)
        setCursorPosition(recalled.length)
        return
      }

      if (key.downArrow) {
        if (historyIndex === -1) return
        const nextIdx = historyIndex + 1
        if (nextIdx >= history.length) {
          setHistoryIndex(-1)
          setInput(savedDraft.current)
          setCursorPosition(savedDraft.current.length)
        } else {
          const recalled = history[nextIdx]
          setHistoryIndex(nextIdx)
          setInput(recalled)
          setCursorPosition(recalled.length)
        }
        return
      }

      if (key.home) {
        setCursorPosition(0)
        return
      }

      if (key.end) {
        setCursorPosition(input.length)
        return
      }

      if (char && !key.ctrl && !key.meta && !key.tab && !key.escape) {
        if (historyIndex !== -1) {
          setHistoryIndex(-1)
          savedDraft.current = ''
        }
        setInput(
          (prev) => prev.slice(0, cursorPosition) + char + prev.slice(cursorPosition)
        )
        setCursorPosition((p) => p + char.length)
      }
    },
    { isActive: initialized && !isLoading }
  )

  const beforeCursor = input.slice(0, cursorPosition)
  const atCursor = input.slice(cursorPosition, cursorPosition + 1) || ' '
  const afterCursor = input.slice(cursorPosition + 1)

  const cols = terminalSize?.columns ?? 80
  const banner =
    cols >= FULL_BANNER_WIDTH
      ? ASCII_ART_FULL
      : cols >= COMPACT_BANNER_WIDTH
        ? ASCII_ART_COMPACT
        : ASCII_ART_TINY

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" paddingX={1}>
        <Text color="ansi:cyan">{banner}</Text>
      </Box>

      <Box flexDirection="column" paddingX={1}>
        {displayMessages.map((msg, idx) => (
          <Box key={idx} flexDirection="column" marginY={0}>
            {msg.role === 'user' && (
              <Box flexDirection="row">
                <Text color="ansi:magentaBright" bold>
                  {'> '}
                </Text>
                <Text color="ansi:magentaBright">{msg.content}</Text>
              </Box>
            )}
            {msg.role === 'assistant' && (
              <Box flexDirection="column" marginLeft={2}>
                <Ansi>{renderMarkdown(msg.content)}</Ansi>
              </Box>
            )}
            {msg.role === 'system' && (
              <Box flexDirection="column" marginLeft={2}>
                <Text color="ansi:yellow" dim>
                  {msg.content}
                </Text>
              </Box>
            )}
          </Box>
        ))}
        {isLoading && (
          <Box marginLeft={2}>
            <Text color="ansi:blackBright" dim>
              Thinking...
            </Text>
          </Box>
        )}
      </Box>

      <Box
        flexDirection="row"
        paddingX={1}
        borderStyle="round"
        borderColor="ansi:cyan"
      >
        <Text color="ansi:cyan" bold>
          {'> '}
        </Text>
        <Text>{beforeCursor}</Text>
        <Text inverse>{atCursor}</Text>
        <Text>{afterCursor}</Text>
      </Box>

      <Box paddingX={1}>
        <Text color="ansi:blackBright" dim>
          {config
            ? `${config.active_model} | ${config.active_provider}`
            : 'Loading...'}
        </Text>
      </Box>
    </Box>
  )
}

export default REPL
