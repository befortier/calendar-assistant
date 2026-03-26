import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createChatRouter, type ChatRouterDeps } from './chat';
import type { IUserRepository, User } from '../db/user-repository';
import type { ClaudeService } from '../services/claude';
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
    claudeService: {
      runAgentLoop: vi.fn().mockResolvedValue('You have 3 meetings today.'),
    } as unknown as ClaudeService,
    calendarServiceFactory: vi.fn().mockReturnValue({} as GoogleCalendarService),
    ...overrides,
  };
}

function makeApp(deps: ChatRouterDeps) {
  const app = express();
  app.use(express.json());
  // Simulate JWT middleware setting userId
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

  it('returns 200 with reply on success', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'What do I have today?' }], timezone: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('You have 3 meetings today.');
  });

  it('calls runAgentLoop with correct arguments', async () => {
    await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], timezone: 'Europe/London' });

    expect(deps.claudeService.runAgentLoop).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Hi' }],
      expect.anything(), // calendar service
      { email: 'alice@example.com', timezone: 'Europe/London' },
    );
  });

  it('creates calendar service with user tokens', async () => {
    await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], timezone: 'UTC' });

    expect(deps.calendarServiceFactory).toHaveBeenCalledWith('access-tok', 'refresh-tok');
  });

  it('defaults timezone to UTC when not provided', async () => {
    await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(deps.claudeService.runAgentLoop).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ timezone: 'UTC' }),
    );
  });

  it('returns 400 when messages is missing', async () => {
    const res = await request(app).post('/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when messages is empty', async () => {
    const res = await request(app).post('/chat').send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when message has invalid role', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'system', content: 'hi' }] });
    expect(res.status).toBe(400);
  });

  it('returns 401 when user is not found in DB', async () => {
    const notFoundDeps = makeDeps({
      users: { upsertUser: vi.fn(), getUserById: vi.fn().mockReturnValue(null) },
    });
    app = makeApp(notFoundDeps);

    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

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
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('reauthorize');
  });

  it('returns 500 when agent loop throws', async () => {
    const errorDeps = makeDeps({
      claudeService: {
        runAgentLoop: vi.fn().mockRejectedValue(new Error('Context window exceeded')),
      } as unknown as ClaudeService,
    });
    app = makeApp(errorDeps);

    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});
