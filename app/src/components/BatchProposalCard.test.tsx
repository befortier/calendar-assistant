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

describe('BatchProposalCard — single-action batch', () => {
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

describe('BatchProposalCard — mixed-action batch', () => {
  it('renders separate sections for each action type', () => {
    render(<BatchProposalCard item={MIXED_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText(/new events/i)).toBeInTheDocument();
    expect(screen.getByText(/update events/i)).toBeInTheDocument();
    expect(screen.getByText(/delete events/i)).toBeInTheDocument();
  });

  it('renders all event titles across sections', () => {
    render(<BatchProposalCard item={MIXED_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText('New Meeting')).toBeInTheDocument();
    expect(screen.getByText('Another Meeting')).toBeInTheDocument();
    expect(screen.getByText('Updated Standup')).toBeInTheDocument();
    expect(screen.getByText('Old Retro')).toBeInTheDocument();
  });

  it('shows generic accept/decline labels for mixed batch', () => {
    render(<BatchProposalCard item={MIXED_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByRole('button', { name: /confirm all \(4\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline all/i })).toBeInTheDocument();
  });

  it('calls onAccept when container accept button clicked', async () => {
    const onAccept = vi.fn();
    render(<BatchProposalCard item={MIXED_BATCH} onAccept={onAccept} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm all/i }));
    expect(onAccept).toHaveBeenCalled();
  });

  it('hides a section when all its events are removed', () => {
    const withDeleteRemoved: BatchProposalItem = { ...MIXED_BATCH, removedIds: ['evt-4'] };
    render(<BatchProposalCard item={withDeleteRemoved} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText(/new events/i)).toBeInTheDocument();
    expect(screen.getByText(/update events/i)).toBeInTheDocument();
    expect(screen.queryByText(/delete events/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm all \(3\)/i })).toBeInTheDocument();
  });

  it('falls back to single-action layout when only one group remains', () => {
    const mostRemoved: BatchProposalItem = { ...MIXED_BATCH, removedIds: ['evt-3', 'evt-4'] };
    render(<BatchProposalCard item={mostRemoved} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    // Should now use single-action style labels
    expect(screen.getByRole('button', { name: /create all \(2\)/i })).toBeInTheDocument();
  });

  it('shows per-section event counts', () => {
    render(<BatchProposalCard item={MIXED_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText(/new events · 2 events/i)).toBeInTheDocument();
    expect(screen.getByText(/update events · 1 event$/i)).toBeInTheDocument();
    expect(screen.getByText(/delete events · 1 event$/i)).toBeInTheDocument();
  });

  it('can remove events across different sections', async () => {
    const onRemoveEvent = vi.fn();
    render(<BatchProposalCard item={MIXED_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={onRemoveEvent} />);
    await userEvent.click(screen.getByRole('button', { name: /remove New Meeting/i }));
    expect(onRemoveEvent).toHaveBeenCalledWith('evt-1');
    await userEvent.click(screen.getByRole('button', { name: /remove Old Retro/i }));
    expect(onRemoveEvent).toHaveBeenCalledWith('evt-4');
  });

  it('shows confirmed badge when status is accepted', () => {
    const accepted: BatchProposalItem = { ...MIXED_BATCH, status: 'accepted' };
    render(<BatchProposalCard item={accepted} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm all/i })).not.toBeInTheDocument();
  });

  it('each section can be collapsed independently', async () => {
    render(<BatchProposalCard item={MIXED_BATCH} onAccept={vi.fn()} onDecline={vi.fn()} onRemoveEvent={vi.fn()} />);
    // All events visible initially
    expect(screen.getByText('New Meeting')).toBeInTheDocument();
    expect(screen.getByText('Old Retro')).toBeInTheDocument();

    // Collapse the delete section
    const hideButtons = screen.getAllByRole('button', { name: /hide/i });
    // Last hide button is for the delete section (canonical order: create, update, delete)
    await userEvent.click(hideButtons[hideButtons.length - 1]);
    expect(screen.queryByText('Old Retro')).not.toBeInTheDocument();
    // Create section still visible
    expect(screen.getByText('New Meeting')).toBeInTheDocument();
  });
});
