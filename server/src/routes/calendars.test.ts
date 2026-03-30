import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCalendarsRouter, type CalendarsRouterDeps } from './calendars';
import { requireUser } from '../middleware/requireUser';
import type { IUserRepository, User } from '../db/user-repository';
import type { GoogleCalendarService } from '../services/tools/calendar/google';

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
    calendarServiceFactory: vi.fn().mockReturnValue({
      listCalendars: vi.fn().mockResolvedValue(FAKE_CALENDARS),
    } as unknown as GoogleCalendarService),
    ...overrides,
  };
}

function makeUserRepo(user: User | null = FAKE_USER): IUserRepository {
  return { upsertUser: vi.fn(), getUserById: vi.fn().mockReturnValue(user) };
}

function makeApp(deps: CalendarsRouterDeps, userRepo: IUserRepository = makeUserRepo()) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = 'user-1';
    next();
  });
  app.use('/calendars', requireUser(userRepo), createCalendarsRouter(deps));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
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
    const res = await request(makeApp(deps, makeUserRepo(null))).get('/calendars');

    expect(res.status).toBe(401);
  });

  it('returns 401 when user has no refresh token', async () => {
    const res = await request(makeApp(deps, makeUserRepo({ ...FAKE_USER, refreshToken: null }))).get('/calendars');

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
