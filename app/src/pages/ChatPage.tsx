import { useCallback, useEffect, useRef, useState } from 'react';
import ChatBubble from '../components/ChatBubble';
import ChatInput from '../components/ChatInput';
import { authenticatedApi } from '../lib/apiInstance';
import { useAuthStore } from '../stores/auth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text };
      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages(updatedMessages);
      setLoading(true);
      setError(null);

      try {
        const data = await authenticatedApi.post<{ reply: string }>('/chat', {
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: data.reply },
        ]);
      } catch {
        setError('Failed to send message. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Calendar Assistant</h1>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-gray-500 transition hover:text-gray-700"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-3" aria-live="polite" aria-atomic="false">
          {messages.length === 0 && !loading && (
            <p className="py-20 text-center text-sm text-gray-400">
              Ask me anything about your calendar.
            </p>
          )}
          {messages.map((msg) => (
            <ChatBubble key={msg.id} role={msg.role} content={msg.content} />
          ))}
          {loading && <ChatBubble role="assistant" content="Thinking…" />}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t bg-white px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {error && (
            <p className="mb-2 text-center text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <ChatInput onSend={handleSend} disabled={loading} />
        </div>
      </footer>
    </div>
  );
}
