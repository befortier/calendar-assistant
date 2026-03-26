import { create } from 'zustand';

const STORAGE_KEY = 'token';

interface AuthState {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(STORAGE_KEY),
  login: (token) => {
    localStorage.setItem(STORAGE_KEY, token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null });
  },
}));
