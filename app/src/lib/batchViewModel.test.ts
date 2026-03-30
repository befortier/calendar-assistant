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

const MIXED_BATCH: BatchProposalItem = {
  type: 'batch_proposal',
  id: 'batch-2',
  entries: [
    { id: 'tc-1', action: 'create', event: { id: 'evt-1', title: 'New Meeting', start: '2026-03-27T09:00:00Z', end: '2026-03-27T10:00:00Z', allDay: false } },
    { id: 'tc-2', action: 'create', event: { id: 'evt-2', title: 'Another Meeting', start: '2026-03-27T11:00:00Z', end: '2026-03-27T12:00:00Z', allDay: false } },
    { id: 'tc-3', action: 'update', event: { id: 'evt-3', title: 'Updated Standup', start: '2026-03-27T09:30:00Z', end: '2026-03-27T10:00:00Z', allDay: false } },
    { id: 'tc-4', action: 'delete', event: { id: 'evt-4', title: 'Old Retro', start: '2026-03-27T14:00:00Z', end: '2026-03-27T15:00:00Z', allDay: false } },
  ],
  status: 'pending',
  removedIds: [],
};

describe('toBatchViewModel', () => {
  describe('single-action batch', () => {
    it('produces one group with the correct action', () => {
      const vm = toBatchViewModel(DELETE_BATCH);
      expect(vm.groups).toHaveLength(1);
      expect(vm.groups[0].action).toBe('delete');
      expect(vm.isMixed).toBe(false);
    });

    it('uses the action style for container labels', () => {
      const vm = toBatchViewModel(DELETE_BATCH);
      expect(vm.acceptLabel).toBe('Confirm delete all');
      expect(vm.declineLabel).toBe('Cancel');
      expect(vm.acceptedLabel).toBe('Deleted');
    });

    it('counts all entries as remaining when none removed', () => {
      const vm = toBatchViewModel(DELETE_BATCH);
      expect(vm.remainingCount).toBe(3);
      expect(vm.groups[0].remainingCount).toBe(3);
    });

    it('marks removed entries and decrements remainingCount', () => {
      const withRemoved: BatchProposalItem = { ...DELETE_BATCH, removedIds: ['evt-1', 'evt-2'] };
      const vm = toBatchViewModel(withRemoved);
      expect(vm.remainingCount).toBe(1);
      expect(vm.groups[0].remainingCount).toBe(1);
      expect(vm.groups[0].entries[0].isRemoved).toBe(true);
      expect(vm.groups[0].entries[1].isRemoved).toBe(true);
      expect(vm.groups[0].entries[2].isRemoved).toBe(false);
    });

    it('defaults to create when entries are empty', () => {
      const empty: BatchProposalItem = { ...DELETE_BATCH, entries: [] };
      const vm = toBatchViewModel(empty);
      expect(vm.groups).toHaveLength(0);
      expect(vm.isMixed).toBe(false);
      expect(vm.acceptLabel).toBe('Create all');
    });

    it('preserves id and status from the original item', () => {
      const accepted: BatchProposalItem = { ...DELETE_BATCH, status: 'accepted' };
      const vm = toBatchViewModel(accepted);
      expect(vm.id).toBe('batch-1');
      expect(vm.status).toBe('accepted');
    });

    it('resolves correct style for create action', () => {
      const createBatch: BatchProposalItem = {
        ...DELETE_BATCH,
        entries: [{ id: 'tc-1', action: 'create', event: { id: 'evt-1', title: 'Meeting', start: '2026-03-27T09:00:00Z', end: '2026-03-27T10:00:00Z', allDay: false } }],
      };
      const vm = toBatchViewModel(createBatch);
      expect(vm.acceptLabel).toBe('Create all');
      expect(vm.declineLabel).toBe('Decline all');
    });

    it('resolves correct style for update action', () => {
      const updateBatch: BatchProposalItem = {
        ...DELETE_BATCH,
        entries: [{ id: 'tc-1', action: 'update', event: { id: 'evt-1', title: 'Meeting', start: '2026-03-27T09:00:00Z', end: '2026-03-27T10:00:00Z', allDay: false } }],
      };
      const vm = toBatchViewModel(updateBatch);
      expect(vm.acceptLabel).toBe('Update all');
    });
  });

  describe('mixed-action batch', () => {
    it('produces multiple groups in canonical order (create, update, delete)', () => {
      const vm = toBatchViewModel(MIXED_BATCH);
      expect(vm.groups).toHaveLength(3);
      expect(vm.groups[0].action).toBe('create');
      expect(vm.groups[1].action).toBe('update');
      expect(vm.groups[2].action).toBe('delete');
      expect(vm.isMixed).toBe(true);
    });

    it('uses generic labels for mixed container', () => {
      const vm = toBatchViewModel(MIXED_BATCH);
      expect(vm.acceptLabel).toBe('Confirm all');
      expect(vm.declineLabel).toBe('Decline all');
      expect(vm.acceptedLabel).toBe('Confirmed');
    });

    it('computes total remainingCount across groups', () => {
      const vm = toBatchViewModel(MIXED_BATCH);
      expect(vm.remainingCount).toBe(4);
      expect(vm.groups[0].remainingCount).toBe(2); // 2 creates
      expect(vm.groups[1].remainingCount).toBe(1); // 1 update
      expect(vm.groups[2].remainingCount).toBe(1); // 1 delete
    });

    it('each group has its own style', () => {
      const vm = toBatchViewModel(MIXED_BATCH);
      expect(vm.groups[0].style.sectionLabel).toBe('New Events');
      expect(vm.groups[1].style.sectionLabel).toBe('Update Events');
      expect(vm.groups[2].style.sectionLabel).toBe('Delete Events');
    });

    it('omits a group when all its entries are removed', () => {
      const withRemoved: BatchProposalItem = { ...MIXED_BATCH, removedIds: ['evt-4'] };
      const vm = toBatchViewModel(withRemoved);
      expect(vm.groups).toHaveLength(2);
      expect(vm.groups.map((g) => g.action)).toEqual(['create', 'update']);
      expect(vm.remainingCount).toBe(3);
    });

    it('becomes non-mixed when only one group remains after removal', () => {
      const withRemoved: BatchProposalItem = { ...MIXED_BATCH, removedIds: ['evt-3', 'evt-4'] };
      const vm = toBatchViewModel(withRemoved);
      expect(vm.groups).toHaveLength(1);
      expect(vm.groups[0].action).toBe('create');
      expect(vm.isMixed).toBe(false);
      expect(vm.acceptLabel).toBe('Create all');
    });

    it('decrements individual group remainingCount independently', () => {
      const withRemoved: BatchProposalItem = { ...MIXED_BATCH, removedIds: ['evt-1'] };
      const vm = toBatchViewModel(withRemoved);
      expect(vm.groups[0].remainingCount).toBe(1); // 1 create left
      expect(vm.groups[1].remainingCount).toBe(1); // update untouched
      expect(vm.groups[2].remainingCount).toBe(1); // delete untouched
      expect(vm.remainingCount).toBe(3);
    });
  });
});
