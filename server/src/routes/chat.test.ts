import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createChatRouter, type ChatRouterDeps } from './chat';
import type { User } from '../db/user-repository';
import type { ClaudeService } from '../services/claude';
import type { GoogleCalendarService } from '../services/googleCalendar';
import type { SSEEvent } from '../services/sse';

const FAKE_USER: User = {
  id: 'user-1',
  googleId: 'g-1',
  email: 'alice@example.com',
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
};

function parseSSE(text: string): SSEEvent[] {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const eventMatch = block.match(/^event: (.+)$/m);
      const dataMatch = block.match(/^data: (.+)$/m);
      if (!eventMatch || !dataMatch) return null;
      return { event: eventMatch[1], data: JSON.parse(dataMatch[1]) } as SSEEvent;
    })
    .filter((e): e is SSEEvent => e !== null);
}

function makeDeps(overrides?: Partial<ChatRouterDeps>): ChatRouterDeps {
  return {
    users: {
      upsertUser: vi.fn(),
      getUserById: vi.fn().mockReturnValue(FAKE_USER),
    },
    claudeService: {
      streamAgentLoop: vi.fn(async (
        _msgs: unknown, _cal: unknown, _ctx: unknown, emit: (e: SSEEvent) => void,
      ) => {
        emit({ event: 'delta', data: { text: 'Hello' } });
        emit({ event: 'done', data: {} });
      }),
    } as unknown as ClaudeService,
    calendarServiceFactory: vi.fn().mockReturnValue({} as GoogleCalendarService),
    ...overrides,
  };
}

function makeApp(deps: ChatRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = 'user-1';
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
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('streams delta and done events', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    const events = parseSSE(res.text);
    expect(events).toContainEqual({ event: 'delta', data: { text: 'Hello' } });
    expect(events[events.length - 1]).toEqual({ event: 'done', data: {} });
  });

  it('calls streamAgentLoop with correct arguments', async () => {
    await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], timezone: 'Europe/London' });

    expect(deps.claudeService.streamAgentLoop).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Hi' }],
      expect.anything(),
      { email: 'alice@example.com', timezone: 'Europe/London' },
      expect.any(Function),
    );
  });

  it('creates calendar service with user tokens', async () => {
    await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(deps.calendarServiceFactory).toHaveBeenCalledWith('access-tok', 'refresh-tok');
  });

  it('defaults timezone to UTC', async () => {
    await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(deps.claudeService.streamAgentLoop).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      expect.objectContaining({ timezone: 'UTC' }),
      expect.any(Function),
    );
  });

  it('returns 400 when messages is missing', async () => {
    const res = await request(app).post('/chat').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is empty', async () => {
    const res = await request(app).post('/chat').send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('returns 401 when userId is missing', async () => {
    const noAuthApp = express();
    noAuthApp.use(express.json());
    noAuthApp.use('/chat', createChatRouter(deps));

    const res = await request(noAuthApp)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(401);
  });

  it('returns 401 when user not found', async () => {
    const notFoundDeps = makeDeps({
      users: { upsertUser: vi.fn(), getUserById: vi.fn().mockReturnValue(null) },
    });
    app = makeApp(notFoundDeps);

    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(401);
  });

  it('returns 401 when no refresh token', async () => {
    const noRefreshDeps = makeDeps({
      users: {
        upsertUser: vi.fn(),
        getUserById: vi.fn().mockReturnValue({ ...FAKE_USER, refreshToken: null }),
      },
    });
    app = makeApp(noRefreshDeps);

    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(401);
  });

  it('streams error event when agent loop throws', async () => {
    const errorDeps = makeDeps({
      claudeService: {
        streamAgentLoop: vi.fn().mockRejectedValue(new Error('Boom')),
      } as unknown as ClaudeService,
    });
    app = makeApp(errorDeps);

    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    const events = parseSSE(res.text);
    expect(events).toContainEqual(expect.objectContaining({ event: 'error' }));
    expect(events[events.length - 1]).toEqual({ event: 'done', data: {} });
  });
});
