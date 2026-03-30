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
}

export interface ActionGroupViewModel {
  action: BatchAction;
  style: ActionStyle;
  entries: BatchEntryViewModel[];
  remainingCount: number;
}

export interface BatchProposalViewModel {
  id: string;
  status: BatchProposalItem['status'];
  groups: ActionGroupViewModel[];
  isMixed: boolean;
  remainingCount: number;
  acceptLabel: string;
  declineLabel: string;
  /** When not mixed, the single group's style (for backward-compat card coloring). */
  containerClassName: string;
  acceptButtonClassName: string;
  acceptedLabel: string;
  acceptedClassName: string;
}

export const ACTION_STYLES: Record<BatchAction, ActionStyle> = {
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

const CANONICAL_ORDER: BatchAction[] = ['create', 'update', 'delete'];

export function toBatchViewModel(item: BatchProposalItem): BatchProposalViewModel {
  const removedSet = new Set(item.removedIds);

  // Group entries by action
  const grouped = new Map<BatchAction, BatchEntryViewModel[]>();
  for (const entry of item.entries) {
    const vm: BatchEntryViewModel = {
      id: entry.id,
      action: entry.action,
      event: entry.event,
      isRemoved: removedSet.has(entry.event.id),
    };
    const list = grouped.get(entry.action);
    if (list) {
      list.push(vm);
    } else {
      grouped.set(entry.action, [vm]);
    }
  }

  // Build groups in canonical order for all actions present in entries
  const allGroups: ActionGroupViewModel[] = [];
  for (const action of CANONICAL_ORDER) {
    const entries = grouped.get(action);
    if (!entries) continue;
    const remainingCount = entries.filter((e) => !e.isRemoved).length;
    allGroups.push({
      action,
      style: ACTION_STYLES[action],
      entries,
      remainingCount,
    });
  }

  // Visible groups are those with remaining events (used for mixed layout rendering)
  const visibleGroups = allGroups.filter((g) => g.remainingCount > 0);
  const totalRemaining = allGroups.reduce((sum, g) => sum + g.remainingCount, 0);
  const isMixed = visibleGroups.length > 1;

  // Container-level labels
  let acceptLabel: string;
  let declineLabel: string;
  let containerClassName: string;
  let acceptButtonClassName: string;
  let acceptedLabel: string;
  let acceptedClassName: string;

  if (isMixed) {
    acceptLabel = 'Confirm all';
    declineLabel = 'Decline all';
    containerClassName = 'border-gray-200 bg-white';
    acceptButtonClassName = 'bg-indigo-600 hover:bg-indigo-700';
    acceptedLabel = 'Confirmed';
    acceptedClassName = 'text-indigo-600';
  } else {
    // Prefer the visible group's style; fall back to allGroups when all removed
    const style = (visibleGroups[0] ?? allGroups[0])?.style ?? ACTION_STYLES.create;
    acceptLabel = style.acceptLabel;
    declineLabel = style.declineLabel;
    containerClassName = style.sectionClassName;
    acceptButtonClassName = style.acceptButtonClassName;
    acceptedLabel = style.acceptedLabel;
    acceptedClassName = style.acceptedClassName;
  }

  // For mixed layout, only include visible groups. For single-action, include the
  // one visible group (preserving action style) or fall back to allGroups so
  // the style is preserved even when all events are removed.
  const groups = isMixed ? visibleGroups : (visibleGroups.length > 0 ? visibleGroups : allGroups);

  return {
    id: item.id,
    status: item.status,
    groups,
    isMixed,
    remainingCount: totalRemaining,
    acceptLabel,
    declineLabel,
    containerClassName,
    acceptButtonClassName,
    acceptedLabel,
    acceptedClassName,
  };
}
