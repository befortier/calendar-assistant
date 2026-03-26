import { ApiClient, createAxiosTransport, authInterceptor } from './api';
import { useAuthStore } from '../stores/auth';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/** Authenticated client — throws if no token. Auto-logouts on 401. */
export const authenticatedApi = new ApiClient(
  createAxiosTransport(
    API_URL,
    [authInterceptor(() => useAuthStore.getState().token)],
    () => useAuthStore.getState().logout(),
  ),
);

/** Unauthenticated client — no interceptors. Use for auth endpoints. */
export const unauthenticatedApi = new ApiClient(createAxiosTransport(API_URL));
