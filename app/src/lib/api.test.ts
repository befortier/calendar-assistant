import { describe, it, expect, vi } from 'vitest';
import { ApiClient, authInterceptor, type HttpTransport } from './api';
import type { InternalAxiosRequestConfig, AxiosHeaders } from 'axios';

function mockTransport(): HttpTransport & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue({ data: { ok: true } }),
    post: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    put: vi.fn().mockResolvedValue({ data: { updated: true } }),
    delete: vi.fn().mockResolvedValue({ data: { deleted: true } }),
  };
}

describe('ApiClient', () => {
  it('get() returns res.data', async () => {
    const transport = mockTransport();
    transport.get.mockResolvedValue({ data: { events: [] } });
    const client = new ApiClient(transport);

    const result = await client.get('/calendar/events');

    expect(result).toEqual({ events: [] });
    expect(transport.get).toHaveBeenCalledWith('/calendar/events', undefined);
  });

  it('post() passes data and returns res.data', async () => {
    const transport = mockTransport();
    transport.post.mockResolvedValue({ data: { reply: 'hello' } });
    const client = new ApiClient(transport);

    const result = await client.post('/chat', { messages: [] });

    expect(result).toEqual({ reply: 'hello' });
    expect(transport.post).toHaveBeenCalledWith('/chat', { messages: [] }, undefined);
  });

  it('put() passes data and returns res.data', async () => {
    const transport = mockTransport();
    const client = new ApiClient(transport);

    const result = await client.put('/users/1', { name: 'Alice' });

    expect(result).toEqual({ updated: true });
    expect(transport.put).toHaveBeenCalledWith('/users/1', { name: 'Alice' }, undefined);
  });

  it('delete() returns res.data', async () => {
    const transport = mockTransport();
    const client = new ApiClient(transport);

    const result = await client.delete('/events/1');

    expect(result).toEqual({ deleted: true });
    expect(transport.delete).toHaveBeenCalledWith('/events/1', undefined);
  });

  it('propagates transport errors', async () => {
    const transport = mockTransport();
    transport.get.mockRejectedValue(new Error('Network error'));
    const client = new ApiClient(transport);

    await expect(client.get('/fail')).rejects.toThrow('Network error');
  });
});

describe('authInterceptor', () => {
  function makeConfig(): InternalAxiosRequestConfig {
    return {
      headers: { set: vi.fn() } as unknown as AxiosHeaders,
    } as unknown as InternalAxiosRequestConfig;
  }

  it('attaches Bearer token when token is available', () => {
    const interceptor = authInterceptor(() => 'jwt-123');
    const config = makeConfig();

    const result = interceptor(config);

    expect(result.headers.Authorization).toBe('Bearer jwt-123');
  });

  it('throws when no token is available', () => {
    const interceptor = authInterceptor(() => null);
    const config = makeConfig();

    expect(() => interceptor(config)).toThrow('Not authenticated');
  });
});
