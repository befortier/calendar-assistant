import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock GoogleOAuthProvider to avoid needing a real client ID
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGoogleLogin: () => vi.fn(),
}));

// Mock API clients used by ChatPage and LoginPage
vi.mock('./lib/apiInstance', () => ({
  authenticatedApi: { post: vi.fn() },
  unauthenticatedApi: { post: vi.fn() },
}));

vi.mock('./lib/streamChat', () => ({
  streamChat: vi.fn(),
}));

// Mock the env check — requireEnv runs at import time
vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');

let mockToken: string | null = null;
vi.mock('./stores/auth', () => ({
  useAuthStore: (selector: (s: { token: string | null; logout: () => void }) => unknown) =>
    selector({ token: mockToken, logout: vi.fn() }),
}));

// Lazy import App after mocks are set up
const { default: App } = await import('./App');

describe('App routing', () => {
  beforeEach(() => {
    mockToken = null;
    window.history.pushState({}, '', '/');
  });

  it('shows login page when not authenticated', () => {
    mockToken = null;
    render(<App />);
    expect(screen.getByRole('heading', { name: /calendar assistant/i })).toBeInTheDocument();
  });

  it('redirects to /chat when authenticated and on /', () => {
    mockToken = 'jwt-123';
    render(<App />);
    expect(screen.getByText(/ask me anything about your calendar/i)).toBeInTheDocument();
  });

  it('shows chat page when authenticated and on /chat', () => {
    mockToken = 'jwt-123';
    window.history.pushState({}, '', '/chat');
    render(<App />);
    expect(screen.getByText(/ask me anything about your calendar/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated users from /chat to /', () => {
    mockToken = null;
    window.history.pushState({}, '', '/chat');
    render(<App />);
    expect(screen.getByRole('heading', { name: /calendar assistant/i })).toBeInTheDocument();
  });

  it('redirects unknown routes to /', () => {
    mockToken = null;
    window.history.pushState({}, '', '/unknown');
    render(<App />);
    expect(screen.getByRole('heading', { name: /calendar assistant/i })).toBeInTheDocument();
  });
});
