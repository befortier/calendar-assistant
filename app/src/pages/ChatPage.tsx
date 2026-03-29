import { Link } from 'react-router-dom';
import ChatBubble from '../components/ChatBubble';
import ChatInput from '../components/ChatInput';
import EventCard from '../components/EventCard';
import BatchProposalCard from '../components/BatchProposalCard';
import CalendarPicker from '../components/CalendarPicker';
import { useChat } from '../hooks/useChat';
import { useAuthStore } from '../stores/auth';
import { useCalendarStore } from '../stores/calendar';

export default function ChatPage() {
  const { items, loading, status, error, bottomRef, sendMessage, respondToProposal, removeFromBatch, respondToBatch } = useChat();
  const logout = useAuthStore((s) => s.logout);
  const clearCalendar = useCalendarStore((s) => s.clearCalendar);

  const handleLogout = () => {
    clearCalendar();
    logout();
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Calendar Assistant</h1>
        <div className="flex items-center gap-4">
          <CalendarPicker />
          <Link to="/preferences" className="text-sm text-gray-500 transition hover:text-gray-700">
            Preferences
          </Link>
          <button type="button" onClick={handleLogout} className="text-sm text-gray-500 transition hover:text-gray-700">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-3" aria-live="polite" aria-atomic="false">
          {items.length === 0 && !loading && (
            <p className="py-20 text-center text-sm text-gray-400">
              Ask me anything about your calendar.
            </p>
          )}
          {items.map((item) => {
            if (item.type === 'message') {
              return <ChatBubble key={item.id} role={item.role} content={item.content} />;
            }
            if (item.type === 'batch_proposal') {
              return (
                <BatchProposalCard
                  key={item.id}
                  item={item}
                  onAccept={() => respondToBatch(item.id, true)}
                  onDecline={() => respondToBatch(item.id, false)}
                  onRemoveEvent={(eventId) => removeFromBatch(item.id, eventId)}
                />
              );
            }
            return (
              <EventCard
                key={item.id}
                action={item.action}
                event={item.event}
                status={item.status}
                onAccept={() => respondToProposal(item.id, true)}
                onDecline={() => respondToProposal(item.id, false)}
              />
            );
          })}
          {status && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-gray-100 px-4 py-2.5 text-sm text-gray-400" role="status">
                {status}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t bg-white px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {error && (
            <p className="mb-2 text-center text-sm text-red-600" role="alert">{error}</p>
          )}
          <ChatInput onSend={sendMessage} disabled={loading} />
        </div>
      </footer>
    </div>
  );
}
