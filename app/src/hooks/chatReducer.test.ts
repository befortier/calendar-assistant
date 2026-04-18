import { describe, it, expect } from 'vitest';
import { chatReducer, initialState, hasPendingProposals } from './chatReducer';
import type { ChatState } from './chatReducer';
import type { ChatItem, ProposalItem, BatchProposalItem } from '../types/chat';

const msg = (role: 'user' | 'assistant', content: string, id = 'msg-1'): ChatItem => ({
  type: 'message', id, role, content,
});

const proposal = (overrides?: Partial<ProposalItem>): ProposalItem => ({
  type: 'event_proposal',
  id: 'p-1',
  action: 'create',
  event: { id: 'evt-1', title: 'Meeting', start: 's', end: 'e', allDay: false },
  status: 'pending',
  ...overrides,
});

const batchProposal = (): BatchProposalItem => ({
  type: 'batch_proposal',
  id: 'b-1',
  entries: [
    { id: 'tc-1', action: 'delete', event: { id: 'evt-1', title: 'Standup', start: 's', end: 'e', allDay: false } },
  ],
  status: 'pending',
  removedIds: [],
});

describe('chatReducer', () => {
  it('SET_ITEMS replaces items', () => {
    const items = [msg('user', 'hello')];
    const state = chatReducer(initialState, { type: 'SET_ITEMS', items });
    expect(state.items).toBe(items);
  });

  it('CLEAR_CHAT resets to initial state', () => {
    const state: ChatState = { items: [msg('user', 'hi')], loading: true, status: 'busy', error: 'err' };
    expect(chatReducer(state, { type: 'CLEAR_CHAT' })).toEqual(initialState);
  });

  it('STREAM_START adds assistant placeholder and sets loading', () => {
    const state = chatReducer(initialState, { type: 'STREAM_START', id: 'a-1' });
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ type: 'message', role: 'assistant', content: '' });
  });

  it('PREPARE_RESPONSE sets status to Thinking', () => {
    const state = chatReducer(initialState, { type: 'PREPARE_RESPONSE', id: 'r-1' });
    expect(state.status).toBe('Thinking…');
  });

  it('PREPARE_RESPONSE adds new placeholder when last assistant message has content', () => {
    const base: ChatState = {
      ...initialState,
      items: [msg('assistant', 'some text', 'a-1')],
    };
    const state = chatReducer(base, { type: 'PREPARE_RESPONSE', id: 'r-2' });
    expect(state.items).toHaveLength(2);
    expect(state.items[1]).toMatchObject({ role: 'assistant', content: '' });
  });

  it('TOOL_CALL sets status with formatted tool name', () => {
    const state = chatReducer(initialState, { type: 'TOOL_CALL', tool: 'get_events' });
    expect(state.status).toBe('Using get events…');
  });

  it('CLEAR_STATUS nulls status', () => {
    const base: ChatState = { ...initialState, status: 'busy' };
    expect(chatReducer(base, { type: 'CLEAR_STATUS' }).status).toBeNull();
  });

  it('APPEND_DELTA appends text to last assistant message', () => {
    const base: ChatState = {
      ...initialState,
      items: [msg('assistant', 'Hello ', 'a-1')],
    };
    const state = chatReducer(base, { type: 'APPEND_DELTA', text: 'world' });
    expect(state.items[0].type === 'message' && state.items[0].content).toBe('Hello world');
  });

  it('APPEND_DELTA does not modify non-assistant last item', () => {
    const base: ChatState = {
      ...initialState,
      items: [msg('user', 'hi')],
    };
    const state = chatReducer(base, { type: 'APPEND_DELTA', text: 'nope' });
    expect(state.items[0].type === 'message' && state.items[0].content).toBe('hi');
  });

  it('ADD_PROPOSAL appends proposal to items', () => {
    const p = proposal();
    const state = chatReducer(initialState, { type: 'ADD_PROPOSAL', proposal: p });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toBe(p);
  });

  it('ADD_BATCH_PROPOSAL appends batch proposal to items', () => {
    const bp = batchProposal();
    const state = chatReducer(initialState, { type: 'ADD_BATCH_PROPOSAL', proposal: bp });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toBe(bp);
  });

  it('ADD_PROPOSAL dedupes against a pending identical proposal', () => {
    const p = proposal();
    const base: ChatState = { ...initialState, items: [p] };
    const state = chatReducer(base, { type: 'ADD_PROPOSAL', proposal: { ...p, id: 'p-2' } });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toBe(p);
  });

  it('ADD_PROPOSAL allows a re-propose after the prior one was declined', () => {
    const declined = proposal({ status: 'declined' });
    const base: ChatState = { ...initialState, items: [declined] };
    const fresh = proposal({ id: 'p-2' });
    const state = chatReducer(base, { type: 'ADD_PROPOSAL', proposal: fresh });
    expect(state.items).toHaveLength(2);
    expect(state.items[1]).toBe(fresh);
  });

  it('ADD_BATCH_PROPOSAL dedupes against a pending batch with the same entries', () => {
    const bp = batchProposal();
    const base: ChatState = { ...initialState, items: [bp] };
    const state = chatReducer(base, { type: 'ADD_BATCH_PROPOSAL', proposal: { ...bp, id: 'b-2' } });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toBe(bp);
  });

  it('ADD_BATCH_PROPOSAL allows a re-propose after every entry was removed by the user', () => {
    const emptied: BatchProposalItem = { ...batchProposal(), removedIds: ['evt-1'] };
    const base: ChatState = { ...initialState, items: [emptied] };
    const fresh: BatchProposalItem = { ...batchProposal(), id: 'b-2' };
    const state = chatReducer(base, { type: 'ADD_BATCH_PROPOSAL', proposal: fresh });
    expect(state.items).toHaveLength(2);
    expect(state.items[1]).toBe(fresh);
  });

  it('ADD_BATCH_PROPOSAL allows a re-propose after the prior batch was declined', () => {
    const declined: BatchProposalItem = { ...batchProposal(), status: 'declined' };
    const base: ChatState = { ...initialState, items: [declined] };
    const fresh: BatchProposalItem = { ...batchProposal(), id: 'b-2' };
    const state = chatReducer(base, { type: 'ADD_BATCH_PROPOSAL', proposal: fresh });
    expect(state.items).toHaveLength(2);
    expect(state.items[1]).toBe(fresh);
  });

  it('REMOVE_FROM_BATCH adds eventId to removedIds', () => {
    const base: ChatState = { ...initialState, items: [batchProposal()] };
    const state = chatReducer(base, { type: 'REMOVE_FROM_BATCH', batchId: 'b-1', eventId: 'evt-1' });
    const batch = state.items[0];
    expect(batch.type === 'batch_proposal' && batch.removedIds).toContain('evt-1');
  });

  it('SET_ERROR sets error and clears loading/status', () => {
    const base: ChatState = { ...initialState, loading: true, status: 'busy' };
    const state = chatReducer(base, { type: 'SET_ERROR', error: 'oops' });
    expect(state.error).toBe('oops');
    expect(state.loading).toBe(false);
    expect(state.status).toBeNull();
  });

  it('STREAM_DONE clears loading and status', () => {
    const base: ChatState = { ...initialState, loading: true, status: 'busy' };
    const state = chatReducer(base, { type: 'STREAM_DONE' });
    expect(state.loading).toBe(false);
    expect(state.status).toBeNull();
  });

  it('returns unchanged state for unknown action', () => {
    const state = chatReducer(initialState, { type: 'UNKNOWN' } as never);
    expect(state).toBe(initialState);
  });
});

describe('hasPendingProposals', () => {
  it('returns true for pending event proposals', () => {
    expect(hasPendingProposals([proposal()])).toBe(true);
  });

  it('returns true for pending batch proposals', () => {
    expect(hasPendingProposals([batchProposal()])).toBe(true);
  });

  it('returns false when all proposals are resolved', () => {
    expect(hasPendingProposals([proposal({ status: 'accepted' })])).toBe(false);
  });

  it('returns false for messages only', () => {
    expect(hasPendingProposals([msg('user', 'hi')])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasPendingProposals([])).toBe(false);
  });
});
