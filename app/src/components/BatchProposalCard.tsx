import { useMemo, useState } from 'react';
import type { BatchProposalItem } from '../types/chat';
import { formatTime } from '../lib/format';
import { toBatchViewModel } from '../lib/batchViewModel';
import type { BatchEntryViewModel } from '../lib/batchViewModel';

interface BatchProposalCardProps {
  item: BatchProposalItem;
  onAccept: () => void;
  onDecline: () => void;
  onRemoveEvent: (eventId: string) => void;
}

export default function BatchProposalCard({ item, onAccept, onDecline, onRemoveEvent }: BatchProposalCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const vm = useMemo(() => toBatchViewModel(item), [item]);
  const listId = `batch-event-list-${vm.id}`;

  return (
    <div
      className={`rounded-lg border-l-4 p-4 ${vm.style.sectionClassName}`}
      role="article"
      aria-label={`${vm.style.sectionLabel} — ${vm.remainingCount} events`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {vm.style.sectionLabel} · {vm.remainingCount} event{vm.remainingCount === 1 ? '' : 's'}
        </p>
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
      </div>

      {!isCollapsed ? (
        <ul id={listId} className="mt-2 space-y-1.5" aria-label="Events in batch">
          {vm.entries.map((entry) => (
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
        <p className={`mt-2 text-xs font-medium ${vm.style.acceptedClassName}`}>{vm.style.acceptedLabel}</p>
      ) : vm.status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={vm.remainingCount === 0}
            className={`rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-40 ${vm.style.acceptButtonClassName}`}
          >
            {vm.style.acceptLabel} ({vm.remainingCount})
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            {vm.style.declineLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ── Sub-components ─────────────────────────── */

interface EventRowProps {
  entry: BatchEntryViewModel;
  isPending: boolean;
  onRemoveEvent: (eventId: string) => void;
}

function EventRow({ entry, isPending, onRemoveEvent }: EventRowProps) {
  const { event, isRemoved, actionLabel } = entry;

  return (
    <li className={`flex items-start justify-between gap-2 text-sm ${isRemoved ? 'opacity-40 line-through' : ''}`}>
      <div>
        <span className="font-medium text-gray-900">{event.title}</span>
        {event.start ? (
          <span className="ml-2 text-xs text-gray-500">{formatTime(event.start)}</span>
        ) : null}
        {actionLabel ? (
          <span className="ml-2 text-xs font-medium uppercase text-gray-400">{actionLabel}</span>
        ) : null}
      </div>
      {isPending && !isRemoved ? (
        <button
          type="button"
          onClick={() => onRemoveEvent(event.id)}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
          aria-label={`Remove ${event.title} from batch`}
        >
          ✕
        </button>
      ) : null}
    </li>
  );
}
