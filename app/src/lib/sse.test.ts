import { describe, it, expect } from 'vitest';
import { parseSSEChunk } from './sse';

describe('parseSSEChunk', () => {
  it('parses a single SSE block', () => {
    const raw = 'event: delta\ndata: {"text":"hello"}\n\n';
    const events = parseSSEChunk(raw);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'delta', data: { text: 'hello' } });
  });

  it('parses multiple SSE blocks', () => {
    const raw =
      'event: delta\ndata: {"text":"a"}\n\n' +
      'event: delta\ndata: {"text":"b"}\n\n' +
      'event: done\ndata: {}\n\n';
    const events = parseSSEChunk(raw);
    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({ event: 'done', data: {} });
  });

  it('skips blocks missing event line', () => {
    const raw = 'data: {"text":"orphan"}\n\n';
    expect(parseSSEChunk(raw)).toHaveLength(0);
  });

  it('skips blocks missing data line', () => {
    const raw = 'event: delta\n\n';
    expect(parseSSEChunk(raw)).toHaveLength(0);
  });

  it('skips blocks with invalid JSON', () => {
    const raw = 'event: delta\ndata: not-json\n\n';
    expect(parseSSEChunk(raw)).toHaveLength(0);
  });

  it('returns empty for empty string', () => {
    expect(parseSSEChunk('')).toHaveLength(0);
  });

  it('parses tool_call events', () => {
    const raw = 'event: tool_call\ndata: {"tool":"get_events"}\n\n';
    const events = parseSSEChunk(raw);
    expect(events[0]).toEqual({ event: 'tool_call', data: { tool: 'get_events' } });
  });

  it('parses event_proposal events', () => {
    const raw = 'event: event_proposal\ndata: {"id":"p-1","action":"create","event":{"id":"e1","title":"Meeting","start":"s","end":"e","allDay":false}}\n\n';
    const events = parseSSEChunk(raw);
    expect(events[0].event).toBe('event_proposal');
    expect(events[0].data).toMatchObject({ id: 'p-1', action: 'create' });
  });

  it('parses error events', () => {
    const raw = 'event: error\ndata: {"message":"something broke"}\n\n';
    const events = parseSSEChunk(raw);
    expect(events[0]).toEqual({ event: 'error', data: { message: 'something broke' } });
  });

  it('handles mixed valid and invalid blocks', () => {
    const raw =
      'event: delta\ndata: {"text":"ok"}\n\n' +
      'event: delta\ndata: bad-json\n\n' +
      'event: done\ndata: {}\n\n';
    const events = parseSSEChunk(raw);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('delta');
    expect(events[1].event).toBe('done');
  });
});
