import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

// Track what useGoogleLogin receives so we can trigger onSuccess/onError
let capturedCallbacks: { onSuccess?: (res: { code: string }) => void; onError?: () => void };
const mockGoogleLogin = vi.fn();

vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: (opts: typeof capturedCallbacks) => {
    capturedCallbacks = opts;
    return mockGoogleLogin.mockImplementation(() => {
      // Default: trigger onSuccess when called
    });
  },
}));

const mockPost = vi.fn();
vi.mock('../lib/apiInstance', () => ({
  unauthenticatedApi: { post: (...args: unknown[]) => mockPost(...args) },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Reset the Zustand auth store between tests
const mockLogin = vi.fn();
vi.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: { login: typeof mockLogin }) => unknown) => selector({ login: mockLogin }),
}));

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sign-in button', () => {
    renderLoginPage();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('renders the heading', () => {
    renderLoginPage();
    expect(screen.getByRole('heading', { name: /calendar assistant/i })).toBeInTheDocument();
  });

  it('calls googleLogin when button is clicked', async () => {
    renderLoginPage();
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(mockGoogleLogin).toHaveBeenCalled();
  });

  it('shows loading state and disables button during auth exchange', async () => {
    // Make the post hang
    mockPost.mockReturnValue(new Promise(() => {}));
    renderLoginPage();

    // Trigger the onSuccess callback (simulating Google returning a code)
    capturedCallbacks.onSuccess?.({ code: 'auth-code-123' });

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Signing in');
      expect(button).toBeDisabled();
    });
  });

  it('calls login and navigates to /chat on successful auth', async () => {
    mockPost.mockResolvedValue({ token: 'jwt-abc' });
    renderLoginPage();

    capturedCallbacks.onSuccess?.({ code: 'auth-code-123' });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/google', { code: 'auth-code-123' });
      expect(mockLogin).toHaveBeenCalledWith('jwt-abc');
      expect(mockNavigate).toHaveBeenCalledWith('/chat', { replace: true });
    });
  });

  it('shows error when auth exchange fails', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));
    renderLoginPage();

    capturedCallbacks.onSuccess?.({ code: 'bad-code' });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed');
    });
  });

  it('shows error when Google sign-in is cancelled', () => {
    renderLoginPage();

    act(() => {
      capturedCallbacks.onError?.();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in was cancelled');
  });

  it('re-enables button after error', async () => {
    mockPost.mockRejectedValue(new Error('fail'));
    renderLoginPage();

    capturedCallbacks.onSuccess?.({ code: 'code' });

    await waitFor(() => {
      expect(screen.getByRole('button')).not.toBeDisabled();
    });
  });
});
