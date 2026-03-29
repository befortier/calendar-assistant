import type { CalendarEvent } from '../lib/sse';

export type ProposalStatus = 'pending' | 'accepted' | 'declined';
export type ProposalAction = 'create' | 'update' | 'delete';

interface EventCardProps {
  action: ProposalAction;
  event: CalendarEvent;
  status: ProposalStatus;
  onAccept: () => void;
  onDecline: () => void;
}

const ACTION_CONFIG = {
  create: { label: 'New Event', accent: 'border-green-400 bg-green-50', accept: 'Create', badge: 'Created', badgeColor: 'text-green-600' },
  update: { label: 'Update Event', accent: 'border-blue-400 bg-blue-50', accept: 'Update', badge: 'Updated', badgeColor: 'text-blue-600' },
  delete: { label: 'Delete Event', accent: 'border-red-400 bg-red-50', accept: 'Confirm Delete', badge: 'Deleted', badgeColor: 'text-red-600' },
};

function formatTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EventCard({ action, event, status, onAccept, onDecline }: EventCardProps) {
  const config = ACTION_CONFIG[action];

  return (
    <div className={`rounded-lg border-l-4 p-4 ${config.accent}`} role="article" aria-label={`${config.label}: ${event.title}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{config.label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{event.title}</p>

      {event.start && (
        <p className="mt-1 text-xs text-gray-600">
          {event.allDay
            ? new Date(event.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            : `${formatTime(event.start)}${event.end ? ` – ${formatTime(event.end)}` : ''}`}
        </p>
      )}

      {event.attendees && event.attendees.length > 0 && (
        <p className="mt-1 text-xs text-gray-600" aria-label="Attendees">
          {event.attendees.map(a => a.email).join(', ')}
        </p>
      )}

      {event.location && (
        <p className="mt-1 text-xs text-gray-600" aria-label="Location">{event.location}</p>
      )}

      {status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            className={`rounded px-3 py-1 text-xs font-medium text-white ${
              action === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {config.accept}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            {action === 'delete' ? 'Cancel' : 'Decline'}
          </button>
        </div>
      )}
      {status === 'accepted' && (
        <p className={`mt-2 text-xs font-medium ${config.badgeColor}`}>{config.badge}</p>
      )}
    </div>
  );
}
