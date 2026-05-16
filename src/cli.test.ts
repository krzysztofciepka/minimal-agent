import { describe, expect, it } from 'bun:test';
import { formatChatResult } from './cli.js';
import type { ChatResult } from './client.js';

// Regression test for the v0.1.0 crash:
//   TypeError: undefined is not an object (evaluating 'response.toolResults.length')
// chatWithTools() returns a ChatResult with `toolExecutions`, never `toolResults`.
// The non-TUI REPL must consume the real shape without throwing.

function makeResult(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    message: { role: 'assistant', content: 'hello from the agent' },
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello from the agent' },
    ],
    toolExecutions: [],
    ...overrides,
  };
}

describe('formatChatResult', () => {
  it('does not throw on a result with no tool executions', () => {
    const lines = formatChatResult(makeResult());
    expect(lines).toContain('hello from the agent');
  });

  it('surfaces tool executions from toolExecutions (not toolResults)', () => {
    const result = makeResult({
      toolExecutions: [
        {
          name: 'bash',
          args: '{"command":"ls"}',
          result: { content: 'file.txt', isError: false },
        },
      ],
    });
    const out = formatChatResult(result).join('\n');
    expect(out).toContain('bash');
    expect(out).toContain('hello from the agent');
  });

  it('handles a non-string assistant content without throwing', () => {
    const result = makeResult({
      message: { role: 'assistant', content: undefined as unknown as string },
      toolExecutions: [],
    });
    expect(() => formatChatResult(result)).not.toThrow();
  });
});
