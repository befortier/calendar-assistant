import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePreferences } from './usePreferences';

vi.mock('../lib/apiInstance', () => ({
  authenticatedApi: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

import { authenticatedApi } from '../lib/apiInstance';

const mockGet = vi.mocked(authenticatedApi.getPreferences);
const mockUpdate = vi.mocked(authenticatedApi.updatePreferences);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePreferences', () => {
  describe('initial load', () => {
    it('starts in loading status', () => {
      mockGet.mockReturnValue(new Promise(() => {})); // never resolves
      const { result } = renderHook(() => usePreferences());
      expect(result.current.status).toBe('loading');
    });

    it('sets content and transitions to idle on success', async () => {
      mockGet.mockResolvedValue({ content: 'prefer mornings' });
      const { result } = renderHook(() => usePreferences());

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.content).toBe('prefer mornings');
      expect(result.current.saved).toBe('prefer mornings');
      expect(result.current.isDirty).toBe(false);
    });

    it('sets error and transitions to error status on failure', async () => {
      mockGet.mockRejectedValue(new Error('network error'));
      const { result } = renderHook(() => usePreferences());

      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(result.current.error).toBe('Failed to load preferences.');
    });
  });

  describe('isDirty', () => {
    it('is false when content matches saved', async () => {
      mockGet.mockResolvedValue({ content: 'hello' });
      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.isDirty).toBe(false);
    });

    it('is true when content differs from saved', async () => {
      mockGet.mockResolvedValue({ content: 'hello' });
      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.status).toBe('idle'));

      act(() => result.current.setContent('hello world'));
      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('save', () => {
    it('updates saved and returns to idle on success', async () => {
      mockGet.mockResolvedValue({ content: 'original' });
      mockUpdate.mockResolvedValue({ content: 'updated' });

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.status).toBe('idle'));

      act(() => result.current.setContent('updated'));
      await act(() => result.current.save());

      expect(result.current.saved).toBe('updated');
      expect(result.current.status).toBe('idle');
      expect(result.current.isDirty).toBe(false);
    });

    it('sets saving status while in flight', async () => {
      mockGet.mockResolvedValue({ content: '' });
      let resolve!: (v: { content: string }) => void;
      mockUpdate.mockReturnValue(new Promise((r) => { resolve = r; }));

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.status).toBe('idle'));

      act(() => result.current.setContent('new content'));
      act(() => { void result.current.save(); });

      expect(result.current.status).toBe('saving');
      act(() => { resolve({ content: 'new content' }); });
    });

    it('sets error and returns to idle on failure', async () => {
      mockGet.mockResolvedValue({ content: 'original' });
      mockUpdate.mockRejectedValue(new Error('server error'));

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.status).toBe('idle'));

      act(() => result.current.setContent('changed'));
      await act(() => result.current.save());

      expect(result.current.error).toBe('Failed to save preferences.');
      expect(result.current.status).toBe('idle');
    });
  });

  describe('retry', () => {
    it('resets status and error then re-fetches', async () => {
      mockGet.mockRejectedValueOnce(new Error('fail'));
      mockGet.mockResolvedValueOnce({ content: 'recovered' });

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.status).toBe('error'));

      act(() => result.current.retry());
      expect(result.current.status).toBe('loading');
      expect(result.current.error).toBe('');

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(result.current.content).toBe('recovered');
    });
  });
});
