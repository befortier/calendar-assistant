import { describe, it, expect } from 'vitest';
import {
  extractMessages,
  resolveProposal,
  buildConfirmText,
  buildBatchConfirmText,
  buildBatchMetadata,
} from './chatHelpers';
import type { ChatItem, ProposalItem, BatchProposalItem } from '../types/chat';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const msg = (role: 'user' | 'assistant', content: string, id = 'msg-1'): ChatItem => ({
  type: 'message', id, role, content,
});

const proposal = (overrides?: Partial<ProposalItem>): ProposalItem => ({
  type: 'event_proposal',
  id: 'p-1',
  action: 'create',
  event: { id: 'evt-1', title: 'Meeting', start: '2026-04-01T10:00:00Z', end: '2026-04-01T11:00:00Z', allDay: false },
  status: 'pending',
  ...overrides,
});

const batchProposal = (overrides?: Partial<BatchProposalItem>): BatchProposalItem => ({
  type: 'batch_proposal',
  id: 'b-1',
  entries: [
    { id: 'tc-1', action: 'delete', event: { id: 'evt-1', title: 'Standup', start: '2026-04-01T09:00:00Z', end: '2026-04-01T09:30:00Z', allDay: false } },
    { id: 'tc-2', action: 'delete', event: { id: 'evt-2', title: 'Retro', start: '2026-04-01T14:00:00Z', end: '2026-04-01T15:00:00Z', allDay: false } },
  ],
  status: 'pending',
  removedIds: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// extractMessages
// ---------------------------------------------------------------------------

describe('extractMessages', () => {
  it('returns only message items', () => {
    const items: ChatItem[] = [msg('user', 'hi'), proposal(), msg('assistant', 'hello')];
    const result = extractMessages(items);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'user', content: 'hi' });
    expect(result[1]).toEqual({ role: 'assistant', content: 'hello' });
  });

  it('includes metadata when present', () => {
    const meta = { confirmedProposal: { action: 'create' as const, eventId: 'e1', title: 'T', start: 's', end: 'e' } };
    const items: ChatItem[] = [{ type: 'message', id: 'm1', role: 'user', content: 'yes', metadata: meta }];
    const result = extractMessages(items);
    expect(result[0].metadata).toEqual(meta);
  });

  it('returns empty array for no messages', () => {
    expect(extractMessages([proposal()])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveProposal
// ---------------------------------------------------------------------------

describe('resolveProposal', () => {
  it('marks proposal accepted', () => {
    const items: ChatItem[] = [msg('user', 'hi'), proposal()];
    const resolved = resolveProposal(items, 'p-1', true);
    const p = resolved.find((i) => i.type === 'event_proposal' && i.id === 'p-1');
    expect(p?.type === 'event_proposal' && p.status).toBe('accepted');
  });

  it('marks proposal declined', () => {
    const items: ChatItem[] = [proposal()];
    const resolved = resolveProposal(items, 'p-1', false);
    const p = resolved.find((i) => i.type === 'event_proposal' && i.id === 'p-1');
    expect(p?.type === 'event_proposal' && p.status).toBe('declined');
  });

  it('auto-declines other pending proposals in the same group on accept', () => {
    const items: ChatItem[] = [
      proposal({ id: 'p-1', group: 'g1' }),
      proposal({ id: 'p-2', group: 'g1' }),
      proposal({ id: 'p-3', group: 'g2' }),
    ];
    const resolved = resolveProposal(items, 'p-1', true);

    const p1 = resolved.find((i) => i.type === 'event_proposal' && i.id === 'p-1');
    const p2 = resolved.find((i) => i.type === 'event_proposal' && i.id === 'p-2');
    const p3 = resolved.find((i) => i.type === 'event_proposal' && i.id === 'p-3');

    expect(p1?.type === 'event_proposal' && p1.status).toBe('accepted');
    expect(p2?.type === 'event_proposal' && p2.status).toBe('declined');
    expect(p3?.type === 'event_proposal' && p3.status).toBe('pending'); // different group
  });

  it('does not auto-decline already resolved proposals in the same group', () => {
    const items: ChatItem[] = [
      proposal({ id: 'p-1', group: 'g1' }),
      proposal({ id: 'p-2', group: 'g1', status: 'accepted' }),
    ];
    const resolved = resolveProposal(items, 'p-1', true);
    const p2 = resolved.find((i) => i.type === 'event_proposal' && i.id === 'p-2');
    expect(p2?.type === 'event_proposal' && p2.status).toBe('accepted'); // unchanged
  });

  it('leaves messages untouched', () => {
    const items: ChatItem[] = [msg('user', 'hi'), proposal()];
    const resolved = resolveProposal(items, 'p-1', true);
    expect(resolved[0]).toEqual(items[0]);
  });
});

// ---------------------------------------------------------------------------
// buildConfirmText
// ---------------------------------------------------------------------------

describe('buildConfirmText', () => {
  it('returns cancel text when not accepted', () => {
    expect(buildConfirmText([], 'p-1', false)).toBe('No, cancel that.');
  });

  it('returns generic yes when proposal not found', () => {
    expect(buildConfirmText([], 'p-missing', true)).toBe('Yes, go ahead.');
  });

  it('builds delete text with title', () => {
    const items: ChatItem[] = [proposal({ action: 'delete' })];
    expect(buildConfirmText(items, 'p-1', true)).toBe('Yes, delete "Meeting".');
  });

  it('builds delete text for untitled event', () => {
    const items: ChatItem[] = [proposal({ action: 'delete', event: { id: 'e1', title: 'Untitled', start: 's', end: 'e', allDay: false } })];
    expect(buildConfirmText(items, 'p-1', true)).toBe('Yes, delete it.');
  });

  it('builds create text with time', () => {
    const items: ChatItem[] = [proposal({ action: 'create' })];
    const text = buildConfirmText(items, 'p-1', true);
    expect(text).toContain('Yes, create "Meeting"');
    expect(text).toContain('at ');
  });

  it('builds update text', () => {
    const items: ChatItem[] = [proposal({ action: 'update' })];
    const text = buildConfirmText(items, 'p-1', true);
    expect(text).toContain('Yes, update "Meeting"');
  });
});

// ---------------------------------------------------------------------------
// buildBatchConfirmText
// ---------------------------------------------------------------------------

describe('buildBatchConfirmText', () => {
  const events = [
    { id: 'e1', title: 'Standup', start: 's', end: 'e', allDay: false },
    { id: 'e2', title: 'Retro', start: 's', end: 'e', allDay: false },
  ];

  it('returns generic yes for empty list', () => {
    expect(buildBatchConfirmText([], 'delete')).toBe('Yes, go ahead.');
  });

  it('handles single delete', () => {
    expect(buildBatchConfirmText([events[0]], 'delete')).toBe('Yes, delete "Standup".');
  });

  it('handles multiple deletes', () => {
    expect(buildBatchConfirmText(events, 'delete')).toBe('Yes, delete all 2 events.');
  });

  it('handles single create', () => {
    expect(buildBatchConfirmText([events[0]], 'create')).toBe('Yes, create "Standup".');
  });

  it('handles multiple creates', () => {
    expect(buildBatchConfirmText(events, 'create')).toBe('Yes, create all 2 events.');
  });

  it('handles update', () => {
    expect(buildBatchConfirmText(events, 'update')).toBe('Yes, update all 2 events.');
  });

  it('handles mixed batch with multiple events', () => {
    expect(buildBatchConfirmText(events, 'create', true)).toBe('Yes, confirm all 2 changes.');
  });

  it('handles mixed batch with single event', () => {
    expect(buildBatchConfirmText([events[0]], 'create', true)).toBe('Yes, confirm "Standup".');
  });
});

// ---------------------------------------------------------------------------
// buildBatchMetadata
// ---------------------------------------------------------------------------

describe('buildBatchMetadata', () => {
  it('builds metadata from batch and remaining events', () => {
    const batch = batchProposal();
    const remainingEvents = batch.entries.map((e) => e.event);
    const meta = buildBatchMetadata(batch, remainingEvents);

    expect(meta.confirmedBatch.batchId).toBe('b-1');
    expect(meta.confirmedBatch.entries).toHaveLength(2);
    expect(meta.confirmedBatch.entries[0]).toMatchObject({
      eventId: 'evt-1',
      action: 'delete',
      title: 'Standup',
    });
  });

  it('only includes remaining events (excluding removed)', () => {
    const batch = batchProposal();
    const remaining = [batch.entries[1].event]; // only Retro
    const meta = buildBatchMetadata(batch, remaining);

    expect(meta.confirmedBatch.entries).toHaveLength(1);
    expect(meta.confirmedBatch.entries[0].title).toBe('Retro');
  });
});
