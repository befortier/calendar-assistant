import { useMemo, useState } from 'react';
import type { BatchProposalItem } from '../types/chat';
import { formatTime } from '../lib/format';
import { toBatchViewModel } from '../lib/batchViewModel';
import type { ActionGroupViewModel, BatchEntryViewModel } from '../lib/batchViewModel';

interface BatchProposalCardProps {
  item: BatchProposalItem;
  onAccept: () => void;
  onDecline: () => void;
  onRemoveEvent: (eventId: string) => void;
}

export default function BatchProposalCard({ item, onAccept, onDecline, onRemoveEvent }: BatchProposalCardProps) {
  const vm = useMemo(() => toBatchViewModel(item), [item]);

  if (vm.isMixed) {
    return (
      <div
        className="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
        role="article"
        aria-label={`Batch proposal — ${vm.remainingCount} events`}
      >
        {vm.groups.map((group) => (
          <ActionGroupSection
            key={group.action}
            group={group}
            isPending={vm.status === 'pending'}
            onRemoveEvent={onRemoveEvent}
          />
        ))}

        {vm.status === 'accepted' ? (
          <p className={`text-xs font-medium ${vm.acceptedClassName}`}>{vm.acceptedLabel}</p>
        ) : vm.status === 'pending' ? (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onAccept}
              disabled={vm.remainingCount === 0}
              className={`rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-40 ${vm.acceptButtonClassName}`}
            >
              {vm.acceptLabel} ({vm.remainingCount})
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              {vm.declineLabel}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  // Single-action batch: render as a single colored card (matches previous layout)
  const group = vm.groups[0];
  return (
    <SingleActionCard
      vm={vm}
      group={group}
      onAccept={onAccept}
      onDecline={onDecline}
      onRemoveEvent={onRemoveEvent}
    />
  );
}

/* ── Sub-components ─────────────────────────── */

interface SingleActionCardProps {
  vm: ReturnType<typeof toBatchViewModel>;
  group: ActionGroupViewModel | undefined;
  onAccept: () => void;
  onDecline: () => void;
  onRemoveEvent: (eventId: string) => void;
}

function SingleActionCard({ vm, group, onAccept, onDecline, onRemoveEvent }: SingleActionCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const listId = `batch-event-list-${vm.id}`;
  const style = group?.style;

  return (
    <div
      className={`rounded-lg border-l-4 p-4 ${vm.containerClassName}`}
      role="article"
      aria-label={`${style?.sectionLabel ?? 'Events'} — ${vm.remainingCount} events`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {style?.sectionLabel ?? 'Events'} · {vm.remainingCount} event{vm.remainingCount === 1 ? '' : 's'}
        </p>
        {group && group.entries.length > 0 && (
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600"
            aria-expanded={!isCollapsed}
            aria-controls={listId}
            aria-label={isCollapsed ? 'Show events' : 'Hide events'}
          >
            {isCollapsed ? 'Show' : 'Hide'}
          </button>
        )}
      </div>

      {!isCollapsed && group ? (
        <ul id={listId} className="mt-2 space-y-1.5" aria-label="Events in batch">
          {group.entries.map((entry) => (
            <EventRow
              key={entry.id}
              entry={entry}
              isPending={vm.status === 'pending'}
              onRemoveEvent={onRemoveEvent}
            />
          ))}
        </ul>
      ) : null}

      {vm.status === 'accepted' ? (
        <p className={`mt-2 text-xs font-medium ${vm.acceptedClassName}`}>{vm.acceptedLabel}</p>
      ) : vm.status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={vm.remainingCount === 0}
            className={`rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-40 ${vm.acceptButtonClassName}`}
          >
            {vm.acceptLabel} ({vm.remainingCount})
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            {vm.declineLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ActionGroupSectionProps {
  group: ActionGroupViewModel;
  isPending: boolean;
  onRemoveEvent: (eventId: string) => void;
}

function ActionGroupSection({ group, isPending, onRemoveEvent }: ActionGroupSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const listId = `batch-group-${group.action}`;

  return (
    <div className={`rounded-lg border-l-4 p-3 ${group.style.sectionClassName}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {group.style.sectionLabel} · {group.remainingCount} event{group.remainingCount === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setIsCollapsed((v) => !v)}
          className="text-xs text-gray-400 hover:text-gray-600"
          aria-expanded={!isCollapsed}
          aria-controls={listId}
          aria-label={isCollapsed ? `Show ${group.style.sectionLabel.toLowerCase()}` : `Hide ${group.style.sectionLabel.toLowerCase()}`}
        >
          {isCollapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!isCollapsed ? (
        <ul id={listId} className="mt-2 space-y-1.5" aria-label={group.style.sectionLabel}>
          {group.entries.map((entry) => (
            <EventRow
              key={entry.id}
              entry={entry}
              isPending={isPending}
              onRemoveEvent={onRemoveEvent}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface EventRowProps {
  entry: BatchEntryViewModel;
  isPending: boolean;
  onRemoveEvent: (eventId: string) => void;
}

function EventRow({ entry, isPending, onRemoveEvent }: EventRowProps) {
  const { event, isRemoved } = entry;

  return (
    <li className={`flex items-start justify-between gap-2 text-sm ${isRemoved ? 'opacity-40 line-through' : ''}`}>
      <div>
        <span className="font-medium text-gray-900">{event.title}</span>
        {event.start ? (
          <span className="ml-2 text-xs text-gray-500">{formatTime(event.start)}</span>
        ) : null}
      </div>
      {isPending && !isRemoved ? (
        <button
          type="button"
          onClick={() => onRemoveEvent(entry.id)}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
          aria-label={`Remove ${event.title} from batch`}
        >
          ✕
        </button>
      ) : null}
    </li>
  );
}
