import { useState } from 'react';
import type { BatchProposalItem } from '../types/chat';

interface BatchProposalCardProps {
  item: BatchProposalItem;
  onAccept: () => void;
  onDecline: () => void;
  onRemoveEvent: (eventId: string) => void;
}

const ACTION_CONFIG = {
  create: { label: 'New Events', accent: 'border-green-400 bg-green-50', accept: 'Create all', badge: 'Created', badgeColor: 'text-green-600', acceptButtonClass: 'bg-green-600 hover:bg-green-700' },
  update: { label: 'Update Events', accent: 'border-blue-400 bg-blue-50', accept: 'Update all', badge: 'Updated', badgeColor: 'text-blue-600', acceptButtonClass: 'bg-blue-600 hover:bg-blue-700' },
  delete: { label: 'Delete Events', accent: 'border-red-400 bg-red-50', accept: 'Confirm delete all', badge: 'Deleted', badgeColor: 'text-red-600', acceptButtonClass: 'bg-red-600 hover:bg-red-700' },
};

function formatTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function BatchProposalCard({ item, onAccept, onDecline, onRemoveEvent }: BatchProposalCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const primaryAction = item.entries[0]?.action ?? 'create';
  const config = ACTION_CONFIG[primaryAction];

  const remainingCount = item.entries.filter((e) => !item.removedIds.includes(e.event.id)).length;

  return (
    <div className={`rounded-lg border-l-4 p-4 ${config.accent}`} role="article" aria-label={`${config.label} — ${remainingCount} events`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {config.label} · {remainingCount} event{remainingCount !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs text-gray-400 hover:text-gray-600"
          aria-expanded={!collapsed}
          aria-controls="batch-event-list"
          aria-label={collapsed ? 'Show events' : 'Hide events'}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <ul id="batch-event-list" className="mt-2 space-y-1.5" aria-label="Events in batch">
          {item.entries.map(({ id, action, event }) => {
            const removed = item.removedIds.includes(event.id);
            const rowConfig = ACTION_CONFIG[action];
            return (
              <li
                key={id}
                className={`flex items-start justify-between gap-2 text-sm ${removed ? 'opacity-40 line-through' : ''}`}
              >
                <div>
                  <span className="font-medium text-gray-900">{event.title}</span>
                  {event.start && (
                    <span className="ml-2 text-xs text-gray-500">{formatTime(event.start)}</span>
                  )}
                  {action !== primaryAction && (
                    <span className="ml-2 text-xs font-medium text-gray-400 uppercase">{rowConfig.label}</span>
                  )}
                </div>
                {item.status === 'pending' && !removed && (
                  <button
                    type="button"
                    onClick={() => onRemoveEvent(event.id)}
                    className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
                    aria-label={`Remove ${event.title} from batch`}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {item.status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={remainingCount === 0}
            className={`rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-40 ${config.acceptButtonClass}`}
          >
            {config.accept} ({remainingCount})
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            {primaryAction === 'delete' ? 'Cancel' : 'Decline all'}
          </button>
        </div>
      )}

      {item.status === 'accepted' && (
        <p className={`mt-2 text-xs font-medium ${config.badgeColor}`}>{config.badge}</p>
      )}
    </div>
  );
}
