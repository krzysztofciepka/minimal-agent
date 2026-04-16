/**
 * REPL Component - Minimal-Agent TUI
 *
 * Uses OpenClaude's Ink rendering engine with minimal-agent's API client.
 */

import * as React from 'react'
import { useState, useCallback, useEffect, useContext } from 'react'
import Box from '../ink/components/Box.js'
import Text from '../ink/components/Text.js'
import useInput from '../ink/hooks/use-input.js'
import useApp from '../ink/hooks/use-app.js'
import { TerminalSizeContext } from '../ink/components/TerminalSizeContext.js'
import { apiClient } from '../client.js'
import { loadConfig } from '../config.js'
import type { Message, Config } from '../types.js'

const ASCII_ART = `
  __  __           _             _
  \\ \\/ /__  _ __  | | _   _ ___(_) | |_
   \\  // _ \\| '_ \\ | || | / __| | | __|
    | | (_) | | | | || |_| \\__ \\ |_|
    |_|\\___/|_| |_||___|___/\\___/\\__|
`

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

  const handleSubmit = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      if (trimmed.startsWith('/')) {
        const cmd = trimmed.slice(1).split(' ')[0]
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
            setDisplayMessages((prev) => [
              ...prev,
              { role: 'system', content: 'Commands: /help, /clear, /exit' },
            ])
            return
          default:
            setDisplayMessages((prev) => [
              ...prev,
              { role: 'system', content: `Unknown command: /${cmd}. Type /help.` },
            ])
            return
        }
      }

      setDisplayMessages((prev) => [...prev, { role: 'user', content: trimmed }])
      setIsLoading(true)

      try {
        const contextMessage = await buildContext(trimmed)
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
    [messages, exit]
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

      if (key.home) {
        setCursorPosition(0)
        return
      }

      if (key.end) {
        setCursorPosition(input.length)
        return
      }

      if (char && !key.ctrl && !key.meta && !key.tab && !key.escape) {
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

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" paddingX={1}>
        <Text color="cyan">{ASCII_ART}</Text>
      </Box>

      <Box flexDirection="column" paddingX={1}>
        {displayMessages.map((msg, idx) => (
          <Box key={idx} flexDirection="column" marginY={0}>
            {msg.role === 'user' && (
              <Box flexDirection="row">
                <Text color="cyan" bold>
                  {'> '}
                </Text>
                <Text color="white">{msg.content}</Text>
              </Box>
            )}
            {msg.role === 'assistant' && (
              <Box flexDirection="column" marginLeft={2}>
                <Text color="green">{msg.content}</Text>
              </Box>
            )}
            {msg.role === 'system' && (
              <Box flexDirection="column" marginLeft={2}>
                <Text color="yellow" dimColor>
                  {msg.content}
                </Text>
              </Box>
            )}
          </Box>
        ))}
        {isLoading && (
          <Box marginLeft={2}>
            <Text color="gray" dimColor>
              Thinking...
            </Text>
          </Box>
        )}
      </Box>

      <Box
        flexDirection="row"
        paddingX={1}
        borderStyle="round"
        borderColor="#56B4C9"
      >
        <Text color="cyan" bold>
          {'> '}
        </Text>
        <Text>{beforeCursor}</Text>
        <Text inverse>{atCursor}</Text>
        <Text>{afterCursor}</Text>
      </Box>

      <Box paddingX={1}>
        <Text color="gray" dimColor>
          {config
            ? `${config.active_model} | ${config.active_provider}`
            : 'Loading...'}
        </Text>
      </Box>
    </Box>
  )
}

export default REPL
