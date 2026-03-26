import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatBubble from './ChatBubble';

describe('ChatBubble', () => {
  it('renders user message content', () => {
    render(<ChatBubble role="user" content="Hello there" />);
    expect(screen.getByText('Hello there')).toBeInTheDocument();
  });

  it('renders assistant message content', () => {
    render(<ChatBubble role="assistant" content="Hi! How can I help?" />);
    expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument();
  });

  it('applies user styling (blue background)', () => {
    render(<ChatBubble role="user" content="test" />);
    const bubble = screen.getByText('test');
    expect(bubble.className).toContain('bg-blue-600');
  });

  it('applies assistant styling (gray background)', () => {
    render(<ChatBubble role="assistant" content="test" />);
    const bubble = screen.getByText('test');
    expect(bubble.className).toContain('bg-gray-100');
  });

  it('aligns user messages to the right', () => {
    render(<ChatBubble role="user" content="test" />);
    const wrapper = screen.getByText('test').parentElement!;
    expect(wrapper.className).toContain('justify-end');
  });

  it('aligns assistant messages to the left', () => {
    render(<ChatBubble role="assistant" content="test" />);
    const wrapper = screen.getByText('test').parentElement!;
    expect(wrapper.className).toContain('justify-start');
  });
});
