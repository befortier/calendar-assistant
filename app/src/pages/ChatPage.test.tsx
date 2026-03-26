import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPage from './ChatPage';

const mockPost = vi.fn();
vi.mock('../lib/apiInstance', () => ({
  authenticatedApi: { post: (...args: unknown[]) => mockPost(...args) },
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

  it('renders empty state message', () => {
    render(<ChatPage />);
    expect(screen.getByText(/ask me anything about your calendar/i)).toBeInTheDocument();
  });

  it('renders header with sign out button', () => {
    render(<ChatPage />);
    expect(screen.getByText('Calendar Assistant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('sends message and displays user bubble', async () => {
    mockPost.mockReturnValue(new Promise(() => {})); // hang
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'What is on my calendar?');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByText('What is on my calendar?')).toBeInTheDocument();
  });

  it('shows thinking indicator while waiting for response', async () => {
    mockPost.mockReturnValue(new Promise(() => {}));
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });

  it('displays assistant reply on success', async () => {
    mockPost.mockResolvedValue({ reply: 'You have 3 meetings today.' });
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText('You have 3 meetings today.')).toBeInTheDocument();
    });
  });

  it('sends full message history with each request', async () => {
    mockPost.mockResolvedValue({ reply: 'First reply' });
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText('First reply')).toBeInTheDocument();
    });

    mockPost.mockResolvedValue({ reply: 'Second reply' });
    await userEvent.type(screen.getByLabelText('Chat message'), 'Follow up');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenLastCalledWith('/chat', expect.objectContaining({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'First reply' },
          { role: 'user', content: 'Follow up' },
        ],
      }));
    });
  });

  it('shows error on API failure', async () => {
    mockPost.mockRejectedValue(new Error('Server error'));
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to send message');
    });
  });

  it('calls logout when sign out is clicked', async () => {
    render(<ChatPage />);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('includes timezone in request', async () => {
    mockPost.mockResolvedValue({ reply: 'ok' });
    render(<ChatPage />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/chat', expect.objectContaining({
        timezone: expect.any(String),
      }));
    });
  });
});
