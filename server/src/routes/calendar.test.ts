import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCalendarRouter, type CalendarRouterDeps } from './calendar';
import { requireUser } from '../middleware/requireUser';
import type { User, IUserRepository } from '../db/user-repository';
import type { GoogleCalendarService, CalendarEvent } from '../services/tools/calendar/google';

const FAKE_USER: User = {
  id: 'user-1',
  googleId: 'g-1',
  email: 'alice@example.com',
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
};

const FAKE_EVENTS: CalendarEvent[] = [
  {
    id: 'e1',
    title: 'Standup',
    start: '2026-03-25T09:00:00-04:00',
    end: '2026-03-25T09:30:00-04:00',
    allDay: false,
  },
  {
    id: 'e2',
    title: 'Lunch',
    start: '2026-03-25T12:00:00-04:00',
    end: '2026-03-25T13:00:00-04:00',
    allDay: false,
  },
];

function makeDeps(overrides?: Partial<CalendarRouterDeps>): CalendarRouterDeps {
  const calendarService = {
    getEvents: vi.fn().mockResolvedValue(FAKE_EVENTS),
  } as unknown as GoogleCalendarService;

  return {
    calendarServiceFactory: vi.fn().mockReturnValue(calendarService),
    ...overrides,
  };
}

function makeUserRepo(user: User | null = FAKE_USER): IUserRepository {
  return {
    upsertUser: vi.fn(),
    getUserById: vi.fn().mockReturnValue(user),
  };
}

function makeApp(deps: CalendarRouterDeps, userRepo: IUserRepository = makeUserRepo()) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = 'user-1';
    next();
  });
  app.use('/calendar', requireUser(userRepo), createCalendarRouter(deps));
  return app;
}

describe('GET /calendar/events', () => {
  let deps: CalendarRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = makeDeps();
    app = makeApp(deps);
  });

  it('returns 200 with events on success', async () => {
    const res = await request(app)
      .get('/calendar/events')
      .query({ start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' });

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.events[0].title).toBe('Standup');
  });

  it('creates calendar service with user tokens', async () => {
    await request(app)
      .get('/calendar/events')
      .query({ start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' });

    expect(deps.calendarServiceFactory).toHaveBeenCalledWith('access-tok', 'refresh-tok');
  });

  it('passes parsed dates to getEvents', async () => {
    await request(app)
      .get('/calendar/events')
      .query({ start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' });

    const calService = (deps.calendarServiceFactory as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(calService.getEvents).toHaveBeenCalledWith(
      new Date('2026-03-25T00:00:00Z'),
      new Date('2026-03-25T23:59:59Z'),
    );
  });

  it('returns 400 when start is missing', async () => {
    const res = await request(app)
      .get('/calendar/events')
      .query({ end: '2026-03-25T23:59:59Z' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when end is missing', async () => {
    const res = await request(app)
      .get('/calendar/events')
      .query({ start: '2026-03-25T00:00:00Z' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when start is not a valid date', async () => {
    const res = await request(app)
      .get('/calendar/events')
      .query({ start: 'not-a-date', end: '2026-03-25T23:59:59Z' });

    expect(res.status).toBe(400);
  });

  it('returns 401 when userId is missing', async () => {
    const noAuthApp = express();
    noAuthApp.use(express.json());
    noAuthApp.use('/calendar', requireUser(makeUserRepo()), createCalendarRouter(deps));

    const res = await request(noAuthApp)
      .get('/calendar/events')
      .query({ start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 when user is not found in DB', async () => {
    app = makeApp(deps, makeUserRepo(null));

    const res = await request(app)
      .get('/calendar/events')
      .query({ start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('not found');
  });

  it('returns 401 when user has no refresh token', async () => {
    app = makeApp(deps, makeUserRepo({ ...FAKE_USER, refreshToken: null }));

    const res = await request(app)
      .get('/calendar/events')
      .query({ start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('reauthorize');
  });

  it('returns 500 when getEvents throws', async () => {
    const calService = {
      getEvents: vi.fn().mockRejectedValue(new Error('Google API error')),
    } as unknown as GoogleCalendarService;
    const errorDeps = makeDeps({
      calendarServiceFactory: vi.fn().mockReturnValue(calService),
    });
    app = makeApp(errorDeps);

    const res = await request(app)
      .get('/calendar/events')
      .query({ start: '2026-03-25T00:00:00Z', end: '2026-03-25T23:59:59Z' });

    expect(res.status).toBe(500);
  });
});
