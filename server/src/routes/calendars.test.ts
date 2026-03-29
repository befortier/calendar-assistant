import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCalendarsRouter, type CalendarsRouterDeps } from './calendars';
import type { IUserRepository, User } from '../db/user-repository';
import type { GoogleCalendarService } from '../services/googleCalendar';

const FAKE_USER: User = {
  id: 'user-1',
  googleId: 'g-1',
  email: 'alice@example.com',
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
};

const FAKE_CALENDARS = [
  { id: 'primary', summary: 'My Calendar', backgroundColor: '#4285f4', primary: true },
  { id: 'work@example.com', summary: 'Work', backgroundColor: '#db4437', primary: false },
];

function makeDeps(overrides?: Partial<CalendarsRouterDeps>): CalendarsRouterDeps {
  return {
    users: {
      upsertUser: vi.fn(),
      getUserById: vi.fn().mockReturnValue(FAKE_USER),
    } as unknown as IUserRepository,
    calendarServiceFactory: vi.fn().mockReturnValue({
      listCalendars: vi.fn().mockResolvedValue(FAKE_CALENDARS),
    } as unknown as GoogleCalendarService),
    ...overrides,
  };
}

function makeApp(deps: CalendarsRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId?: string }).userId = 'user-1';
    next();
  });
  app.use('/calendars', createCalendarsRouter(deps));
  return app;
}

describe('GET /calendars', () => {
  let deps: CalendarsRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = makeDeps();
    app = makeApp(deps);
  });

  it('returns the list of calendars', async () => {
    const res = await request(app).get('/calendars');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ calendars: FAKE_CALENDARS });
  });

  it('creates calendar service with user tokens', async () => {
    await request(app).get('/calendars');

    expect(deps.calendarServiceFactory).toHaveBeenCalledWith('access-tok', 'refresh-tok');
  });

  it('returns 401 when user not found', async () => {
    const d = makeDeps({ users: { getUserById: vi.fn().mockReturnValue(null), upsertUser: vi.fn() } as unknown as IUserRepository });
    const res = await request(makeApp(d)).get('/calendars');

    expect(res.status).toBe(401);
  });

  it('returns 401 when user has no refresh token', async () => {
    const d = makeDeps({
      users: { getUserById: vi.fn().mockReturnValue({ ...FAKE_USER, refreshToken: null }), upsertUser: vi.fn() } as unknown as IUserRepository,
    });
    const res = await request(makeApp(d)).get('/calendars');

    expect(res.status).toBe(401);
  });

  it('returns 502 when Google API throws', async () => {
    const d = makeDeps({
      calendarServiceFactory: vi.fn().mockReturnValue({
        listCalendars: vi.fn().mockRejectedValue(new Error('Google down')),
      } as unknown as GoogleCalendarService),
    });
    const res = await request(makeApp(d)).get('/calendars');

    expect(res.status).toBe(502);
  });
});
