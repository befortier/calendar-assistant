import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createChatRouter, type ChatRouterDeps } from './chat';
import type { IUserRepository, User } from '../db/user-repository';
import type { LLMProvider } from '../services/agent/types';
import type { GoogleCalendarService } from '../services/googleCalendar';

const FAKE_USER: User = {
  id: 'user-1',
  googleId: 'g-1',
  email: 'alice@example.com',
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
};

function makeDeps(overrides?: Partial<ChatRouterDeps>): ChatRouterDeps {
  return {
    users: {
      upsertUser: vi.fn(),
      getUserById: vi.fn().mockReturnValue(FAKE_USER),
    },
    provider: {
      stream: vi.fn().mockResolvedValue({ stopReason: 'end_turn', text: 'Hello', toolCalls: [] }),
    } as unknown as LLMProvider,
    calendarServiceFactory: vi.fn().mockReturnValue({} as GoogleCalendarService),
    ...overrides,
  };
}

function makeApp(deps: ChatRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId?: string }).userId = 'user-1';
    next();
  });
  app.use('/chat', createChatRouter(deps));
  return app;
}

describe('POST /chat', () => {
  let deps: ChatRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = makeDeps();
    app = makeApp(deps);
  });

  it('returns SSE content type', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], timezone: 'UTC' });

    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('creates calendar service with user tokens', async () => {
    await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], timezone: 'UTC' });

    expect(deps.calendarServiceFactory).toHaveBeenCalledWith('access-tok', 'refresh-tok');
  });

  it('returns 400 when messages is missing', async () => {
    const res = await request(app).post('/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when messages is empty', async () => {
    const res = await request(app).post('/chat').send({ messages: [], timezone: 'UTC' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when message has invalid role', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'system', content: 'hi' }], timezone: 'UTC' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when userId is missing from request', async () => {
    const noAuthApp = express();
    noAuthApp.use(express.json());
    noAuthApp.use('/chat', createChatRouter(deps));

    const res = await request(noAuthApp)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], timezone: 'UTC' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 when user is not found in DB', async () => {
    const notFoundDeps = makeDeps({
      users: { upsertUser: vi.fn(), getUserById: vi.fn().mockReturnValue(null) },
    });
    app = makeApp(notFoundDeps);

    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], timezone: 'UTC' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('not found');
  });

  it('returns 401 when user has no refresh token', async () => {
    const noRefreshDeps = makeDeps({
      users: {
        upsertUser: vi.fn(),
        getUserById: vi.fn().mockReturnValue({ ...FAKE_USER, refreshToken: null }),
      },
    });
    app = makeApp(noRefreshDeps);

    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], timezone: 'UTC' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('reauthorize');
  });

  it('defaults timezone to UTC when not provided', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('returns 400 for invalid timezone', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], timezone: 'Not/A/Timezone' });

    expect(res.status).toBe(400);
  });
});
