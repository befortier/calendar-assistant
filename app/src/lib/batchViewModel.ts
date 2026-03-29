import type { BatchProposalItem } from '../types/chat';
import type { CalendarEvent } from './sse';

type BatchAction = 'create' | 'update' | 'delete';

export interface ActionStyle {
  sectionLabel: string;
  sectionClassName: string;
  acceptLabel: string;
  acceptedLabel: string;
  acceptedClassName: string;
  acceptButtonClassName: string;
  declineLabel: string;
}

export interface BatchEntryViewModel {
  id: string;
  action: BatchAction;
  event: CalendarEvent;
  isRemoved: boolean;
  /** Only shown when this entry's action differs from the batch primary action. */
  actionLabel: string | null;
}

export interface BatchProposalViewModel {
  id: string;
  status: BatchProposalItem['status'];
  primaryAction: BatchAction;
  style: ActionStyle;
  entries: BatchEntryViewModel[];
  remainingCount: number;
}

const ACTION_STYLES: Record<BatchAction, ActionStyle> = {
  create: {
    sectionLabel: 'New Events',
    sectionClassName: 'border-green-400 bg-green-50',
    acceptLabel: 'Create all',
    acceptedLabel: 'Created',
    acceptedClassName: 'text-green-600',
    acceptButtonClassName: 'bg-green-600 hover:bg-green-700',
    declineLabel: 'Decline all',
  },
  update: {
    sectionLabel: 'Update Events',
    sectionClassName: 'border-blue-400 bg-blue-50',
    acceptLabel: 'Update all',
    acceptedLabel: 'Updated',
    acceptedClassName: 'text-blue-600',
    acceptButtonClassName: 'bg-blue-600 hover:bg-blue-700',
    declineLabel: 'Decline all',
  },
  delete: {
    sectionLabel: 'Delete Events',
    sectionClassName: 'border-red-400 bg-red-50',
    acceptLabel: 'Confirm delete all',
    acceptedLabel: 'Deleted',
    acceptedClassName: 'text-red-600',
    acceptButtonClassName: 'bg-red-600 hover:bg-red-700',
    declineLabel: 'Cancel',
  },
};

const ROW_LABELS: Record<BatchAction, string> = {
  create: 'New',
  update: 'Update',
  delete: 'Delete',
};

export function toBatchViewModel(item: BatchProposalItem): BatchProposalViewModel {
  const primaryAction = item.entries[0]?.action ?? 'create';
  const removedSet = new Set(item.removedIds);

  const entries: BatchEntryViewModel[] = item.entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    event: entry.event,
    isRemoved: removedSet.has(entry.event.id),
    actionLabel: entry.action !== primaryAction ? ROW_LABELS[entry.action] : null,
  }));

  return {
    id: item.id,
    status: item.status,
    primaryAction,
    style: ACTION_STYLES[primaryAction],
    entries,
    remainingCount: entries.filter((e) => !e.isRemoved).length,
  };
}
