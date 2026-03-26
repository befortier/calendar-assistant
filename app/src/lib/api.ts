import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

/** Abstraction over the HTTP transport — mockable in tests. */
export interface HttpTransport {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<{ data: T }>;
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<{ data: T }>;
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
}

/** An interceptor that can inspect/modify the request config before it is sent. */
export type RequestInterceptor = (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;

export function createAxiosTransport(baseURL: string, interceptors: RequestInterceptor[] = []): HttpTransport {
  const instance = axios.create({ baseURL });
  for (const interceptor of interceptors) {
    instance.interceptors.request.use(interceptor);
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

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.get<T>(url, config);
    return res.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.post<T>(url, data, config);
    return res.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.put<T>(url, data, config);
    return res.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.delete<T>(url, config);
    return res.data;
  }
}
