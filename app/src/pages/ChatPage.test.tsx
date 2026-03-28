import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPage from './ChatPage';

// Mock streamChat to simulate SSE events
const mockStreamChat = vi.fn();
vi.mock('../lib/streamChat', () => ({
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
}));

const mockLogout = vi.fn();
vi.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: { logout: typeof mockLogout }) => unknown) =>
    selector({ logout: mockLogout }),
}));

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state', () => {
    render(<ChatPage />);
    expect(screen.getByText(/ask me anything about your calendar/i)).toBeInTheDocument();
  });

  it('renders header with sign out button', () => {
    render(<ChatPage />);
    expect(screen.getByText('Calendar Assistant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('sends message and shows user bubble', async () => {
    mockStreamChat.mockImplementation(async (_msgs: unknown, _tz: unknown, onEvent: (e: unknown) => void) => {
      onEvent({ event: 'done', data: {} });
    });
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('streams text deltas into assistant message', async () => {
    mockStreamChat.mockImplementation(async (_msgs: unknown, _tz: unknown, onEvent: (e: unknown) => void) => {
      onEvent({ event: 'delta', data: { text: 'You have ' } });
      onEvent({ event: 'delta', data: { text: '3 meetings.' } });
      onEvent({ event: 'done', data: {} });
    });
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hi');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText('You have 3 meetings.')).toBeInTheDocument();
    });
  });

  it('shows tool call status', async () => {
    mockStreamChat.mockImplementation(async (_msgs: unknown, _tz: unknown, onEvent: (e: unknown) => void) => {
      onEvent({ event: 'tool_call', data: { tool: 'get_events' } });
      // Don't emit done — status should be visible
    });
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hi');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText('Using get events…')).toBeInTheDocument();
    });
  });

  it('renders event proposal card', async () => {
    mockStreamChat.mockImplementation(async (_msgs: unknown, _tz: unknown, onEvent: (e: unknown) => void) => {
      onEvent({
        event: 'event_proposal',
        data: {
          id: 'prop-1',
          action: 'create',
          event: { id: '', title: 'Standup', start: '2026-03-26T09:00:00Z', end: '2026-03-26T09:30:00Z', allDay: false },
        },
      });
      onEvent({ event: 'done', data: {} });
    });
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Create standup');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText('Standup')).toBeInTheDocument();
      expect(screen.getByText('Create')).toBeInTheDocument();
      expect(screen.getByText('Decline')).toBeInTheDocument();
    });
  });

  it('shows error on stream failure', async () => {
    mockStreamChat.mockRejectedValue(new Error('Network error'));
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hi');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
    });
  });

  it('calls logout when sign out clicked', async () => {
    render(<ChatPage />);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockLogout).toHaveBeenCalled();
  });
});
