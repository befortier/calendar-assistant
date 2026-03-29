import { useState, useEffect, useCallback } from 'react';
import { Link, useBeforeUnload } from 'react-router-dom';
import { authenticatedApi } from '../lib/apiInstance';

export default function PreferencesPage() {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    authenticatedApi.getPreferences()
      .then((res) => {
        setContent(res.content);
        setSaved(res.content);
        setStatus('idle');
      })
      .catch(() => {
        setError('Failed to load preferences.');
        setStatus('error');
      });
  }, []);

  async function handleSave() {
    setStatus('saving');
    setError('');
    try {
      const res = await authenticatedApi.updatePreferences(content);
      setSaved(res.content);
      setStatus('idle');
    } catch {
      setError('Failed to save preferences.');
      setStatus('idle');
    }
  }

  const isDirty = content !== saved;

  useBeforeUnload(
    useCallback((e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    }, [isDirty]),
  );

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">User Preferences</h1>
        <Link to="/chat" className="text-sm text-gray-500 transition-colors hover:text-gray-700">
          Back to chat
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <p className="text-sm text-gray-500">
            Tell the assistant about your scheduling preferences — e.g. "I prefer morning meetings",
            "never book me before 9am", "I work from home on Fridays". The assistant will read these
            automatically and can update them when you share new preferences in chat.
          </p>

          {status === 'loading' ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <textarea
              className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 shadow-sm focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              rows={12}
              placeholder="No preferences saved yet. Start typing…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              aria-label="User preferences"
            />
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || status === 'saving'}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {status === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {!isDirty && status === 'idle' && saved !== '' && (
              <span className="text-sm text-gray-400">Saved</span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
