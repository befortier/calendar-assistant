import { describe, it, expect } from 'vitest';
import { parseSSEChunk } from './sse';

describe('parseSSEChunk', () => {
  it('parses a single event', () => {
    const raw = 'event: delta\ndata: {"text":"hello"}\n\n';
    const events = parseSSEChunk(raw);
    expect(events).toEqual([{ event: 'delta', data: { text: 'hello' } }]);
  });

  it('parses multiple events', () => {
    const raw = 'event: status\ndata: {"type":"thinking"}\n\nevent: delta\ndata: {"text":"hi"}\n\n';
    const events = parseSSEChunk(raw);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('status');
    expect(events[1].event).toBe('delta');
  });

  it('skips malformed blocks', () => {
    const raw = 'garbage\n\nevent: done\ndata: {}\n\n';
    const events = parseSSEChunk(raw);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('done');
  });

  it('skips blocks with invalid JSON', () => {
    const raw = 'event: delta\ndata: {bad json}\n\nevent: done\ndata: {}\n\n';
    const events = parseSSEChunk(raw);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('done');
  });

  it('returns empty array for empty input', () => {
    expect(parseSSEChunk('')).toEqual([]);
  });

  it('parses event_proposal events', () => {
    const raw = 'event: event_proposal\ndata: {"id":"p1","action":"create","event":{"id":"","title":"Meeting","start":"2026-03-26T09:00:00Z","end":"2026-03-26T09:30:00Z","allDay":false}}\n\n';
    const events = parseSSEChunk(raw);
    expect(events[0].event).toBe('event_proposal');
    expect(events[0].data).toMatchObject({ action: 'create', event: { title: 'Meeting' } });
  });
});
