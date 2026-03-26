import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { signJwt, verifyJwt, jwtMiddleware } from './jwt';

const SECRET = 'test-secret';

describe('signJwt', () => {
  it('returns a non-empty string', () => {
    const token = signJwt('user-123', SECRET);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });
});

describe('verifyJwt', () => {
  it('returns userId from a valid token', () => {
    const token = signJwt('user-123', SECRET);
    expect(verifyJwt(token, SECRET)).toBe('user-123');
  });

  it('throws on invalid token', () => {
    expect(() => verifyJwt('bad.token.here', SECRET)).toThrow();
  });

  it('throws on wrong secret', () => {
    const token = signJwt('user-123', SECRET);
    expect(() => verifyJwt(token, 'wrong-secret')).toThrow();
  });
});

describe('jwtMiddleware', () => {
  const middleware = jwtMiddleware(SECRET);

  function makeReq(authHeader?: string): Request {
    return { headers: { authorization: authHeader } } as unknown as Request;
  }

  function makeRes(): { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } & Partial<Response> {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    return { status, json } as unknown as ReturnType<typeof makeRes>;
  }

  it('calls next() and attaches userId for valid Bearer token', () => {
    const token = signJwt('user-abc', SECRET);
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes() as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe('user-abc');
  });

  it('returns 401 when Authorization header is missing', () => {
    const req = makeReq(undefined);
    const res = makeRes() as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token is invalid', () => {
    const req = makeReq('Bearer bad.token');
    const res = makeRes() as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
