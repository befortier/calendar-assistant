import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chat';
import { initialState } from '../hooks/chatReducer';
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

beforeEach(() => {
  useChatStore.setState({ ...initialState, dispatch: useChatStore.getState().dispatch });
});

// ---------------------------------------------------------------------------
// Core store behavior
// ---------------------------------------------------------------------------

describe('useChatStore', () => {
  it('starts with initial state', () => {
    const { items, loading, status, error } = useChatStore.getState();
    expect(items).toEqual([]);
    expect(loading).toBe(false);
    expect(status).toBeNull();
    expect(error).toBeNull();
  });

  it('state persists across multiple getState calls (not component-scoped)', () => {
    const { dispatch } = useChatStore.getState();
    dispatch({ type: 'SET_ITEMS', items: [msg('user', 'hello')] });

    // Simulate a "different component" reading the store
    const { items } = useChatStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].type === 'message' && items[0].content).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Dispatch delegates to chatReducer — all actions
// ---------------------------------------------------------------------------

describe('useChatStore.dispatch', () => {
  it('SET_ITEMS replaces items', () => {
    const items = [msg('user', 'hello')];
    useChatStore.getState().dispatch({ type: 'SET_ITEMS', items });
    expect(useChatStore.getState().items).toEqual(items);
  });

  it('CLEAR_CHAT resets to initial state', () => {
    useChatStore.getState().dispatch({ type: 'SET_ITEMS', items: [msg('user', 'hi')] });
    useChatStore.getState().dispatch({ type: 'CLEAR_CHAT' });

    const { items, loading, status, error } = useChatStore.getState();
    expect(items).toEqual([]);
    expect(loading).toBe(false);
    expect(status).toBeNull();
    expect(error).toBeNull();
  });

  it('STREAM_START adds assistant placeholder and sets loading', () => {
    useChatStore.getState().dispatch({ type: 'STREAM_START', id: 'a-1' });

    const { items, loading } = useChatStore.getState();
    expect(loading).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'message', role: 'assistant', content: '' });
  });

  it('PREPARE_RESPONSE sets status to Thinking', () => {
    useChatStore.getState().dispatch({ type: 'PREPARE_RESPONSE', id: 'r-1' });
    expect(useChatStore.getState().status).toBe('Thinking…');
  });

  it('TOOL_CALL sets status with formatted tool name', () => {
    useChatStore.getState().dispatch({ type: 'TOOL_CALL', tool: 'get_events' });
    expect(useChatStore.getState().status).toBe('Using get events…');
  });

  it('CLEAR_STATUS nulls status', () => {
    useChatStore.getState().dispatch({ type: 'TOOL_CALL', tool: 'x' });
    useChatStore.getState().dispatch({ type: 'CLEAR_STATUS' });
    expect(useChatStore.getState().status).toBeNull();
  });

  it('APPEND_DELTA appends text to last assistant message', () => {
    useChatStore.getState().dispatch({ type: 'STREAM_START', id: 'a-1' });
    useChatStore.getState().dispatch({ type: 'APPEND_DELTA', text: 'Hello ' });
    useChatStore.getState().dispatch({ type: 'APPEND_DELTA', text: 'world' });

    const last = useChatStore.getState().items[0];
    expect(last.type === 'message' && last.content).toBe('Hello world');
  });

  it('ADD_PROPOSAL appends proposal to items', () => {
    const p = proposal();
    useChatStore.getState().dispatch({ type: 'ADD_PROPOSAL', proposal: p });
    expect(useChatStore.getState().items).toHaveLength(1);
    expect(useChatStore.getState().items[0]).toEqual(p);
  });

  it('ADD_PROPOSAL deduplicates by start+end+title+action+recurrence', () => {
    const p = proposal();
    useChatStore.getState().dispatch({ type: 'ADD_PROPOSAL', proposal: p });
    useChatStore.getState().dispatch({ type: 'ADD_PROPOSAL', proposal: { ...p, id: 'p-2' } });
    expect(useChatStore.getState().items).toHaveLength(1);
  });

  it('ADD_BATCH_PROPOSAL appends batch proposal to items', () => {
    const bp = batchProposal();
    useChatStore.getState().dispatch({ type: 'ADD_BATCH_PROPOSAL', proposal: bp });
    expect(useChatStore.getState().items).toHaveLength(1);
  });

  it('REMOVE_FROM_BATCH adds eventId to removedIds', () => {
    useChatStore.getState().dispatch({ type: 'ADD_BATCH_PROPOSAL', proposal: batchProposal() });
    useChatStore.getState().dispatch({ type: 'REMOVE_FROM_BATCH', batchId: 'b-1', eventId: 'evt-1' });

    const batch = useChatStore.getState().items[0];
    expect(batch.type === 'batch_proposal' && batch.removedIds).toContain('evt-1');
  });

  it('SET_ERROR sets error and clears loading/status', () => {
    useChatStore.getState().dispatch({ type: 'STREAM_START', id: 'a-1' });
    useChatStore.getState().dispatch({ type: 'SET_ERROR', error: 'oops' });

    const { error, loading, status } = useChatStore.getState();
    expect(error).toBe('oops');
    expect(loading).toBe(false);
    expect(status).toBeNull();
  });

  it('STREAM_DONE clears loading and status', () => {
    useChatStore.getState().dispatch({ type: 'STREAM_START', id: 'a-1' });
    useChatStore.getState().dispatch({ type: 'STREAM_DONE' });

    const { loading, status } = useChatStore.getState();
    expect(loading).toBe(false);
    expect(status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// State survives "component remount" — the core bug fix
// ---------------------------------------------------------------------------

describe('useChatStore state persistence', () => {
  it('retains messages after clearing and re-reading (simulates navigation)', () => {
    const { dispatch } = useChatStore.getState();
    dispatch({ type: 'SET_ITEMS', items: [msg('user', 'hello'), msg('assistant', 'hi there')] });

    // Simulate navigating away (no component holds a reference)
    // Then navigating back — a new "component" reads the store
    const { items } = useChatStore.getState();
    expect(items).toHaveLength(2);
    expect(items[0].type === 'message' && items[0].content).toBe('hello');
    expect(items[1].type === 'message' && items[1].content).toBe('hi there');
  });

  it('retains streaming state across reads', () => {
    const { dispatch } = useChatStore.getState();
    dispatch({ type: 'STREAM_START', id: 'a-1' });
    dispatch({ type: 'APPEND_DELTA', text: 'partial response' });

    const { items, loading } = useChatStore.getState();
    expect(loading).toBe(true);
    expect(items[0].type === 'message' && items[0].content).toBe('partial response');
  });

  it('retains proposals across reads', () => {
    const { dispatch } = useChatStore.getState();
    dispatch({ type: 'ADD_PROPOSAL', proposal: proposal() });
    dispatch({ type: 'ADD_BATCH_PROPOSAL', proposal: batchProposal() });

    const { items } = useChatStore.getState();
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('event_proposal');
    expect(items[1].type).toBe('batch_proposal');
  });

  it('CLEAR_CHAT fully resets even after accumulated state', () => {
    const { dispatch } = useChatStore.getState();
    dispatch({ type: 'SET_ITEMS', items: [msg('user', 'hi')] });
    dispatch({ type: 'STREAM_START', id: 'a-1' });
    dispatch({ type: 'APPEND_DELTA', text: 'response' });
    dispatch({ type: 'SET_ERROR', error: 'fail' });

    dispatch({ type: 'CLEAR_CHAT' });

    const { items, loading, status, error } = useChatStore.getState();
    expect(items).toEqual([]);
    expect(loading).toBe(false);
    expect(status).toBeNull();
    expect(error).toBeNull();
  });
});
