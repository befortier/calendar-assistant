import { describe, it, expect, vi } from 'vitest';
import { ClaudeAdapter } from './claudeAdapter';
import { StopReason } from '../../agent/types';
import type { ToolDefinition, ChatMessage } from '../../agent/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockStream(events: object[], finalMessage: object) {
  const iterator = events[Symbol.iterator]();
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        const result = iterator.next();
        return result.done
          ? { done: true as const, value: undefined }
          : { done: false as const, value: result.value };
      },
    }),
    finalMessage: async () => finalMessage,
  };
}

function mockClient(streamReturn: ReturnType<typeof mockStream>) {
  return {
    messages: {
      stream: vi.fn().mockReturnValue(streamReturn),
    },
  } as unknown as ConstructorParameters<typeof ClaudeAdapter>[0];
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_events',
    description: 'Get calendar events',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

const MESSAGES: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeAdapter', () => {
  // a. Delta forwarding
  it('forwards text deltas via onDelta callback', async () => {
    const stream = mockStream(
      [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
      ],
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hello world' }],
      },
    );
    const client = mockClient(stream);
    const adapter = new ClaudeAdapter(client);
    const deltas: string[] = [];

    await adapter.stream('system', MESSAGES, TOOLS, (text) => deltas.push(text));

    expect(deltas).toEqual(['Hello', ' world']);
  });

  // b. Stop reason mapping
  it('maps end_turn stop reason to StopReason.EndTurn', async () => {
    const stream = mockStream([], {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hi' }],
    });
    const adapter = new ClaudeAdapter(mockClient(stream));

    const result = await adapter.stream('sys', MESSAGES, TOOLS, vi.fn());

    expect(result.stopReason).toBe(StopReason.EndTurn);
  });

  it('maps tool_use stop reason to StopReason.ToolUse', async () => {
    const stream = mockStream([], {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'tc-1', name: 'get_events', input: {} },
      ],
    });
    const adapter = new ClaudeAdapter(mockClient(stream));

    const result = await adapter.stream('sys', MESSAGES, TOOLS, vi.fn());

    expect(result.stopReason).toBe(StopReason.ToolUse);
  });

  // c. Tool use extraction
  it('extracts tool calls from tool_use content blocks', async () => {
    const stream = mockStream([], {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'tc-1', name: 'get_events', input: { start: 'a', end: 'b' } },
        { type: 'tool_use', id: 'tc-2', name: 'get_events', input: { start: 'c', end: 'd' } },
      ],
    });
    const adapter = new ClaudeAdapter(mockClient(stream));

    const result = await adapter.stream('sys', MESSAGES, TOOLS, vi.fn());

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]).toEqual({
      id: 'tc-1',
      name: 'get_events',
      input: { start: 'a', end: 'b' },
    });
    expect(result.toolCalls[1]).toEqual({
      id: 'tc-2',
      name: 'get_events',
      input: { start: 'c', end: 'd' },
    });
  });

  // d. Empty assistant content gets fallback text block
  it('sends non-empty content for assistant message with empty text and no tool calls', async () => {
    const stream = mockStream([], {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
    });
    const client = mockClient(stream);
    const adapter = new ClaudeAdapter(client);
    const messages: ChatMessage[] = [
      { role: 'assistant', text: '', toolCalls: [] },
      { role: 'user', content: 'Hi' },
    ];

    await adapter.stream('sys', messages, TOOLS, vi.fn());

    const call = (client.messages.stream as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const assistantMsg = call.messages.find((m: { role: string }) => m.role === 'assistant');
    expect(assistantMsg.content.length).toBeGreaterThan(0);
    expect(assistantMsg.content[0]).toEqual({ type: 'text', text: '' });
  });

  // e. Text extraction
  it('extracts and joins text from text content blocks', async () => {
    const stream = mockStream([], {
      stop_reason: 'end_turn',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' world' },
      ],
    });
    const adapter = new ClaudeAdapter(mockClient(stream));

    const result = await adapter.stream('sys', MESSAGES, TOOLS, vi.fn());

    expect(result.text).toBe('Hello world');
  });
});
