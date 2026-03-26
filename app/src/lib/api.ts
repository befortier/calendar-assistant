import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

export class ApiClient {
  private readonly http: AxiosInstance;

  constructor(baseURL: string, getToken?: () => string | null) {
    this.http = axios.create({ baseURL });

    if (getToken) {
      this.http.interceptors.request.use((config) => {
        const token = getToken();
        if (!token) {
          throw new Error('Not authenticated — no token available');
        }
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      });
    }
  }

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
