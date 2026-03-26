import { ApiClient } from './api';
import { useAuthStore } from '../stores/auth';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/** Authenticated client — throws if no token. Use for all post-login routes. */
export const authenticatedApi = new ApiClient(API_URL, () => useAuthStore.getState().token);

/** Unauthenticated client — no token requirement. Use for auth endpoints. */
export const unauthenticatedApi = new ApiClient(API_URL);
