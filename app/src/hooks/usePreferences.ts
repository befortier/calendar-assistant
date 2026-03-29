import { useState, useEffect, useCallback } from 'react';
import { authenticatedApi } from '../lib/apiInstance';

export type PreferencesStatus = 'idle' | 'loading' | 'saving' | 'error';

export interface UsePreferencesResult {
  content: string;
  setContent: (value: string) => void;
  saved: string;
  status: PreferencesStatus;
  error: string;
  isDirty: boolean;
  save: () => Promise<void>;
  retry: () => void;
}

export function usePreferences(): UsePreferencesResult {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState<PreferencesStatus>('loading');
  const [error, setError] = useState('');

  // Internal fetch — does NOT reset status/error before fetching.
  // Safe to call from an effect (no synchronous setState). To reset UI state first, call retry().
  const load = useCallback(() => {
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

  useEffect(() => { load(); }, [load]);

  // Retry resets UI state synchronously first, then re-fetches.
  const retry = useCallback(() => {
    setStatus('loading');
    setError('');
    load();
  }, [load]);

  const save = useCallback(async () => {
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
  }, [content]);

  return {
    content,
    setContent,
    saved,
    status,
    error,
    isDirty: content !== saved,
    save,
    retry,
  };
}
