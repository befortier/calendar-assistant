import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventCard from './EventCard';
import type { CalendarEvent } from '../lib/sse';

const EVENT: CalendarEvent = {
  id: 'evt-1',
  title: 'Team Standup',
  start: '2026-03-26T09:00:00Z',
  end: '2026-03-26T09:30:00Z',
  allDay: false,
  attendees: ['bob@example.com'],
  location: 'Room A',
};

describe('EventCard', () => {
  it('renders create variant with event details', () => {
    render(<EventCard action="create" event={EVENT} status="pending" onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText('New Event')).toBeInTheDocument();
    expect(screen.getByText('Team Standup')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('Room A')).toBeInTheDocument();
  });

  it('renders update variant header', () => {
    render(<EventCard action="update" event={EVENT} status="pending" onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText('Update Event')).toBeInTheDocument();
  });

  it('renders delete variant with confirm button', () => {
    render(<EventCard action="delete" event={EVENT} status="pending" onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText('Delete Event')).toBeInTheDocument();
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onAccept when accept button clicked', async () => {
    const onAccept = vi.fn();
    render(<EventCard action="create" event={EVENT} status="pending" onAccept={onAccept} onDecline={vi.fn()} />);
    await userEvent.click(screen.getByText('Create'));
    expect(onAccept).toHaveBeenCalled();
  });

  it('calls onDecline when decline button clicked', async () => {
    const onDecline = vi.fn();
    render(<EventCard action="create" event={EVENT} status="pending" onAccept={vi.fn()} onDecline={onDecline} />);
    await userEvent.click(screen.getByText('Decline'));
    expect(onDecline).toHaveBeenCalled();
  });

  it('shows accepted badge instead of buttons', () => {
    render(<EventCard action="create" event={EVENT} status="accepted" onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
  });

  it('shows declined badge instead of buttons', () => {
    render(<EventCard action="create" event={EVENT} status="declined" onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText('Declined')).toBeInTheDocument();
  });

  it('hides location when not present', () => {
    const noLocation = { ...EVENT, location: undefined };
    render(<EventCard action="create" event={noLocation} status="pending" onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.queryByText('Room A')).not.toBeInTheDocument();
  });
});
