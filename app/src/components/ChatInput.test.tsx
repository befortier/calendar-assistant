import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInput from './ChatInput';

describe('ChatInput', () => {
  it('renders input and send button', () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByLabelText('Chat message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('calls onSend with trimmed text on submit', async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    await userEvent.type(screen.getByLabelText('Chat message'), '  Hello  ');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('Hello');
  });

  it('clears input after sending', async () => {
    render(<ChatInput onSend={vi.fn()} />);

    const input = screen.getByLabelText('Chat message');
    await userEvent.type(input, 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(input).toHaveValue('');
  });

  it('disables send button when input is empty', () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('disables send button when only whitespace', async () => {
    render(<ChatInput onSend={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Chat message'), '   ');
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('does not call onSend when disabled', async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled />);

    expect(screen.getByLabelText('Chat message')).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('submits on Enter key', async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    await userEvent.type(screen.getByLabelText('Chat message'), 'Hello{enter}');

    expect(onSend).toHaveBeenCalledWith('Hello');
  });
});
