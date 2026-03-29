import { describe, it, expect } from 'vitest';
import { toBatchViewModel } from './batchViewModel';
import type { BatchProposalItem } from '../types/chat';

const DELETE_BATCH: BatchProposalItem = {
  type: 'batch_proposal',
  id: 'batch-1',
  entries: [
    { id: 'tc-1', action: 'delete', event: { id: 'evt-1', title: 'Standup', start: '2026-03-26T09:00:00Z', end: '2026-03-26T09:30:00Z', allDay: false } },
    { id: 'tc-2', action: 'delete', event: { id: 'evt-2', title: 'Planning', start: '2026-03-26T10:00:00Z', end: '2026-03-26T11:00:00Z', allDay: false } },
    { id: 'tc-3', action: 'delete', event: { id: 'evt-3', title: 'Retro', start: '2026-03-26T14:00:00Z', end: '2026-03-26T15:00:00Z', allDay: false } },
  ],
  status: 'pending',
  removedIds: [],
};

describe('toBatchViewModel', () => {
  it('derives primaryAction from first entry', () => {
    const vm = toBatchViewModel(DELETE_BATCH);
    expect(vm.primaryAction).toBe('delete');
    expect(vm.style.sectionLabel).toBe('Delete Events');
  });

  it('defaults to create when entries are empty', () => {
    const empty: BatchProposalItem = { ...DELETE_BATCH, entries: [] };
    const vm = toBatchViewModel(empty);
    expect(vm.primaryAction).toBe('create');
  });

  it('counts all entries as remaining when none removed', () => {
    const vm = toBatchViewModel(DELETE_BATCH);
    expect(vm.remainingCount).toBe(3);
    expect(vm.entries.every((e) => !e.isRemoved)).toBe(true);
  });

  it('marks removed entries and decrements remainingCount', () => {
    const withRemoved: BatchProposalItem = { ...DELETE_BATCH, removedIds: ['evt-1', 'evt-2'] };
    const vm = toBatchViewModel(withRemoved);
    expect(vm.remainingCount).toBe(1);
    expect(vm.entries[0].isRemoved).toBe(true);
    expect(vm.entries[1].isRemoved).toBe(true);
    expect(vm.entries[2].isRemoved).toBe(false);
  });

  it('sets actionLabel only for entries with a different action than primary', () => {
    const mixed: BatchProposalItem = {
      ...DELETE_BATCH,
      entries: [
        { id: 'tc-1', action: 'delete', event: { id: 'evt-1', title: 'Standup', start: '2026-03-26T09:00:00Z', end: '2026-03-26T09:30:00Z', allDay: false } },
        { id: 'tc-2', action: 'create', event: { id: 'evt-2', title: 'New Meeting', start: '2026-03-27T10:00:00Z', end: '2026-03-27T11:00:00Z', allDay: false } },
      ],
    };
    const vm = toBatchViewModel(mixed);
    expect(vm.entries[0].actionLabel).toBeNull();
    expect(vm.entries[1].actionLabel).toBe('New');
  });

  it('resolves correct style for each action type', () => {
    const createBatch: BatchProposalItem = {
      ...DELETE_BATCH,
      entries: [{ id: 'tc-1', action: 'create', event: { id: 'evt-1', title: 'Meeting', start: '2026-03-27T09:00:00Z', end: '2026-03-27T10:00:00Z', allDay: false } }],
    };
    expect(toBatchViewModel(createBatch).style.acceptLabel).toBe('Create all');

    const updateBatch: BatchProposalItem = {
      ...DELETE_BATCH,
      entries: [{ id: 'tc-1', action: 'update', event: { id: 'evt-1', title: 'Meeting', start: '2026-03-27T09:00:00Z', end: '2026-03-27T10:00:00Z', allDay: false } }],
    };
    expect(toBatchViewModel(updateBatch).style.acceptLabel).toBe('Update all');

    expect(toBatchViewModel(DELETE_BATCH).style.declineLabel).toBe('Cancel');
    expect(toBatchViewModel(createBatch).style.declineLabel).toBe('Decline all');
  });

  it('preserves id and status from the original item', () => {
    const accepted: BatchProposalItem = { ...DELETE_BATCH, status: 'accepted' };
    const vm = toBatchViewModel(accepted);
    expect(vm.id).toBe('batch-1');
    expect(vm.status).toBe('accepted');
  });
});
