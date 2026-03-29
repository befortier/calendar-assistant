import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPreferencesRouter } from './preferences';
import type { IPreferencesRepository } from '../db/preferences-repository';

function makePreferencesRepo(overrides: Partial<IPreferencesRepository> = {}): IPreferencesRepository {
  return {
    getPreferences: vi.fn().mockReturnValue(''),
    setPreferences: vi.fn(),
    ...overrides,
  };
}

function makeApp(repo: IPreferencesRepository) {
  const app = express();
  app.use(express.json());
  // Inject userId as middleware would in production
  app.use((req, _res, next) => { (req as unknown as { userId: string }).userId = 'user-123'; next(); });
  app.use('/', createPreferencesRouter({ preferences: repo }));
  return app;
}

describe('GET /preferences', () => {
  it('returns content from the repository', async () => {
    const repo = makePreferencesRepo({ getPreferences: vi.fn().mockReturnValue('I prefer mornings.') });
    const res = await request(makeApp(repo)).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: 'I prefer mornings.' });
    expect(repo.getPreferences).toHaveBeenCalledWith('user-123');
  });

  it('returns empty string when no preferences saved', async () => {
    const repo = makePreferencesRepo();
    const res = await request(makeApp(repo)).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: '' });
  });
});

describe('PUT /preferences', () => {
  it('saves content and echoes it back', async () => {
    const repo = makePreferencesRepo();
    const res = await request(makeApp(repo))
      .put('/')
      .send({ content: 'Never schedule before 9am.' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: 'Never schedule before 9am.' });
    expect(repo.setPreferences).toHaveBeenCalledWith('user-123', 'Never schedule before 9am.');
  });

  it('returns 400 when body is missing content field', async () => {
    const repo = makePreferencesRepo();
    const res = await request(makeApp(repo)).put('/').send({});
    expect(res.status).toBe(400);
    expect(repo.setPreferences).not.toHaveBeenCalled();
  });
});
