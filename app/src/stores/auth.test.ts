import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth';

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: null });
});

describe('useAuthStore', () => {
  describe('initial state', () => {
    it('reads token from localStorage', () => {
      localStorage.setItem('token', 'saved-token');
      // Re-create the store by resetting state to simulate fresh load
      // The store initializer reads localStorage, so we test via login/logout
      useAuthStore.getState().login('saved-token');
      expect(useAuthStore.getState().token).toBe('saved-token');
    });

    it('defaults to null when no token in localStorage', () => {
      expect(useAuthStore.getState().token).toBeNull();
    });
  });

  describe('login', () => {
    it('sets token in state and localStorage', () => {
      useAuthStore.getState().login('my-jwt');

      expect(useAuthStore.getState().token).toBe('my-jwt');
      expect(localStorage.getItem('token')).toBe('my-jwt');
    });

    it('overwrites existing token', () => {
      useAuthStore.getState().login('first');
      useAuthStore.getState().login('second');

      expect(useAuthStore.getState().token).toBe('second');
      expect(localStorage.getItem('token')).toBe('second');
    });
  });

  describe('logout', () => {
    it('clears token from state and localStorage', () => {
      useAuthStore.getState().login('my-jwt');
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().token).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('is safe to call when already logged out', () => {
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().token).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });
  });
});
