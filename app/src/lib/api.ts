import axios, { type InternalAxiosRequestConfig } from 'axios';

/** Framework-agnostic request options — no axios types leak into the interface. */
export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  signal?: AbortSignal;
}

/** Abstraction over the HTTP transport — mockable in tests. */
export interface HttpTransport {
  get<T>(url: string, config?: RequestOptions): Promise<{ data: T }>;
  post<T>(url: string, data?: unknown, config?: RequestOptions): Promise<{ data: T }>;
  put<T>(url: string, data?: unknown, config?: RequestOptions): Promise<{ data: T }>;
  delete<T>(url: string, config?: RequestOptions): Promise<{ data: T }>;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary: boolean;
}

/** An interceptor that can inspect/modify the request config before it is sent. */
export type RequestInterceptor = (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;

/** Called when an API response returns a 401 — the session is invalid. */
export type UnauthorizedHandler = () => void;

export function createAxiosTransport(
  baseURL: string,
  interceptors: RequestInterceptor[] = [],
  onUnauthorized?: UnauthorizedHandler,
): HttpTransport {
  const instance = axios.create({ baseURL });
  for (const interceptor of interceptors) {
    instance.interceptors.request.use(interceptor);
  }
  if (onUnauthorized) {
    instance.interceptors.response.use(undefined, (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        onUnauthorized();
      }
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    });
  }
  return instance;
}

/** Auth interceptor — attaches Bearer token or throws if not authenticated. */
export function authInterceptor(getToken: () => string | null): RequestInterceptor {
  return (config) => {
    const token = getToken();
    if (!token) {
      throw new Error('Not authenticated — no token available');
    }
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  };
}

export class ApiClient {
  constructor(private readonly http: HttpTransport) {}

  async get<T>(url: string, config?: RequestOptions): Promise<T> {
    const res = await this.http.get<T>(url, config);
    return res.data;
  }

  async post<T>(url: string, data?: unknown, config?: RequestOptions): Promise<T> {
    const res = await this.http.post<T>(url, data, config);
    return res.data;
  }

  async put<T>(url: string, data?: unknown, config?: RequestOptions): Promise<T> {
    const res = await this.http.put<T>(url, data, config);
    return res.data;
  }

  async delete<T>(url: string, config?: RequestOptions): Promise<T> {
    const res = await this.http.delete<T>(url, config);
    return res.data;
  }

  async getCalendars(): Promise<{ calendars: CalendarInfo[] }> {
    return this.get<{ calendars: CalendarInfo[] }>('/calendars');
  }

  async getPreferences(): Promise<{ content: string }> {
    return this.get<{ content: string }>('/preferences');
  }

  async updatePreferences(content: string): Promise<{ content: string }> {
    return this.put<{ content: string }>('/preferences', { content });
  }
}
