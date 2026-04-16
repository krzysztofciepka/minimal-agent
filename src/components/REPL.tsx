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
import { apiClient } from '../client.js'
import { loadConfig } from '../config.js'
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

const ASCII_ART_FULL = `            _       _                 _                          _
  _ __ ___ (_)_ __ (_)_ __ ___   __ _| |   __ _  __ _  ___ _ __ | |_
 | '_ \` _ \\| | '_ \\| | '_ \` _ \\ / _\` | |  / _\` |/ _\` |/ _ \\ '_ \\| __|
 | | | | | | | | | | | | | | | | (_| | | | (_| | (_| |  __/ | | | |_
 |_| |_| |_|_|_| |_|_|_| |_| |_|\\__,_|_|  \\__,_|\\__, |\\___|_| |_|\\__|
                                                |___/`

const ASCII_ART_COMPACT = `            _       _                 _
  _ __ ___ (_)_ __ (_)_ __ ___   __ _| |
 | '_ \` _ \\| | '_ \\| | '_ \` _ \\ / _\` | |
 | | | | | | | | | | | | | | | | (_| | |
 |_| |_| |_|_|_| |_|_|_| |_| |_|\\__,_|_|
                    agent`

const ASCII_ART_TINY = 'minimal-agent'

const FULL_BANNER_WIDTH = 72
const COMPACT_BANNER_WIDTH = 42

type DisplayMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

async function buildContext(userMessage: string): Promise<string> {
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

    const parts: string[] = []
    if (claudeMd) parts.push(`# CLAUDE.md\n${claudeMd}`)
    if (agentsMd) parts.push(`# AGENTS.md\n${agentsMd}`)
    parts.push(userMessage)

    return parts.filter(Boolean).join('\n\n---\n\n')
  } catch {
    return userMessage
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
        const contextMessage = await buildContext(promptBody)
        const newMessages: Message[] = [
          ...messages,
          { role: 'user', content: contextMessage },
        ]

        const response = await apiClient.chatWithTools(newMessages)
        const assistantContent =
          typeof response.message.content === 'string'
            ? response.message.content
            : JSON.stringify(response.message.content)

        setMessages([...newMessages, response.message])
        setDisplayMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent || '(no content)' },
        ])

        if (response.toolResults.length > 0) {
          setDisplayMessages((prev) => [
            ...prev,
            {
              role: 'system',
              content: `Tool results: ${JSON.stringify(response.toolResults, null, 2)}`,
            },
          ])
        }
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
            setMessages([])
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
              const skillInvocation = args.length
                ? `${skillContent}\n\n---\n\nArguments: ${args.join(' ')}`
                : skillContent
              await sendToLLM(skillInvocation, `/${cmd}${args.length ? ' ' + args.join(' ') : ''}`)
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
                <Text color="ansi:white">{msg.content}</Text>
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
