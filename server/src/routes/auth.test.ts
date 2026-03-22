import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRouter } from './auth';
import type { IUserRepository } from '../db/client';

const SECRET = 'test-jwt-secret';

const FAKE_GOOGLE_RESULT = {
  googleId: 'g-123',
  email: 'user@example.com',
  accessToken: 'access-xyz',
  refreshToken: 'refresh-xyz',
};

function makeApp() {
  const users: IUserRepository = {
    upsertUser: vi.fn().mockReturnValue('user-id-abc'),
    getUserById: vi.fn().mockReturnValue(null),
  };
  const tokenExchanger = vi.fn().mockResolvedValue(FAKE_GOOGLE_RESULT);

  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter({ users, jwtSecret: SECRET, tokenExchanger }));
  return { app, tokenExchanger, users };
}

describe('POST /auth/google', () => {
  let app: express.Express;
  let tokenExchanger: ReturnType<typeof vi.fn>;
  let users: IUserRepository;

  beforeEach(() => {
    ({ app, tokenExchanger, users } = makeApp());
  });

  it('returns 200 with a token on success', async () => {
    const res = await request(app).post('/auth/google').send({ code: 'auth-code-abc' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
  });

  it('calls tokenExchanger with the provided code', async () => {
    await request(app).post('/auth/google').send({ code: 'my-code' });
    expect(tokenExchanger).toHaveBeenCalledWith('my-code');
  });

  it('upserts the user with data from Google', async () => {
    await request(app).post('/auth/google').send({ code: 'my-code' });
    expect(users.upsertUser).toHaveBeenCalledWith('g-123', 'user@example.com', 'access-xyz', 'refresh-xyz');
  });

  it('returns 400 when code is missing', async () => {
    const res = await request(app).post('/auth/google').send({});
    expect(res.status).toBe(400);
  });

  it('returns 500 when tokenExchanger throws', async () => {
    tokenExchanger.mockRejectedValueOnce(new Error('Google error'));
    const res = await request(app).post('/auth/google').send({ code: 'bad-code' });
    expect(res.status).toBe(500);
  });
});
