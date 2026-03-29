import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BatchProposalCard from './BatchProposalCard';
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

describe('BatchProposalCard', () => {
  it('renders all event titles', () => {
    render(<BatchProposalCard item={DELETE_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText('Standup')).toBeInTheDocument();
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('Retro')).toBeInTheDocument();
  });

  it('shows count in heading and accept button', () => {
    render(<BatchProposalCard item={DELETE_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText(/3 events/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm delete all \(3\)/i)).toBeInTheDocument();
  });

  it('calls onAccept when accept button clicked', async () => {
    const onAccept = vi.fn();
    render(<BatchProposalCard item={DELETE_BATCH} onAccept={onAccept} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm delete all/i }));
    expect(onAccept).toHaveBeenCalled();
  });

  it('calls onDecline when decline button clicked', async () => {
    const onDecline = vi.fn();
    render(<BatchProposalCard item={DELETE_BATCH} onAccept={vi.fn()} onDecline={onDecline} onRemoveEvent={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onDecline).toHaveBeenCalled();
  });

  it('calls onRemoveEvent with the event id when remove button clicked', async () => {
    const onRemoveEvent = vi.fn();
    render(<BatchProposalCard item={DELETE_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={onRemoveEvent} />);
    await userEvent.click(screen.getByRole('button', { name: /remove Standup/i }));
    expect(onRemoveEvent).toHaveBeenCalledWith('evt-1');
  });

  it('renders removed events with reduced opacity class and hides their remove button', () => {
    const withRemoved: BatchProposalItem = { ...DELETE_BATCH, removedIds: ['evt-1'] };
    render(<BatchProposalCard item={withRemoved} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /remove Standup/i })).not.toBeInTheDocument();
    // Other remove buttons still present
    expect(screen.getByRole('button', { name: /remove Planning/i })).toBeInTheDocument();
  });

  it('decrements count when events are removed', () => {
    const withRemoved: BatchProposalItem = { ...DELETE_BATCH, removedIds: ['evt-1', 'evt-2'] };
    render(<BatchProposalCard item={withRemoved} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText(/· 1 event$/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm delete all \(1\)/i)).toBeInTheDocument();
  });

  it('disables accept button when all events removed', () => {
    const allRemoved: BatchProposalItem = { ...DELETE_BATCH, removedIds: ['evt-1', 'evt-2', 'evt-3'] };
    render(<BatchProposalCard item={allRemoved} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByRole('button', { name: /confirm delete all \(0\)/i })).toBeDisabled();
  });

  it('collapses and expands event list', async () => {
    render(<BatchProposalCard item={DELETE_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText('Standup')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /hide/i }));
    expect(screen.queryByText('Standup')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show/i }));
    expect(screen.getByText('Standup')).toBeInTheDocument();
  });

  it('hides action buttons and shows accepted badge when status is accepted', () => {
    const accepted: BatchProposalItem = { ...DELETE_BATCH, status: 'accepted' };
    render(<BatchProposalCard item={accepted} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /confirm delete all/i })).not.toBeInTheDocument();
    expect(screen.getByText('Deleted')).toBeInTheDocument();
  });

  it('renders create variant with correct labels', () => {
    const createBatch: BatchProposalItem = {
      ...DELETE_BATCH,
      entries: [
        { id: 'tc-1', action: 'create', event: { id: 'evt-1', title: 'New Meeting', start: '2026-03-27T09:00:00Z', end: '2026-03-27T10:00:00Z', allDay: false } },
        { id: 'tc-2', action: 'create', event: { id: 'evt-2', title: 'Another Meeting', start: '2026-03-27T11:00:00Z', end: '2026-03-27T12:00:00Z', allDay: false } },
      ],
    };
    render(<BatchProposalCard item={createBatch} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText(/new events/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create all \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline all/i })).toBeInTheDocument();
  });
});
