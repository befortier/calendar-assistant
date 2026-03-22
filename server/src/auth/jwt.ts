import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export function signJwt(userId: string, secret: string): string {
  return jwt.sign({ userId }, secret, { expiresIn: '7d' });
}

export function verifyJwt(token: string, secret: string): string {
  const payload = jwt.verify(token, secret) as { userId: string };
  return payload.userId;
}

export function jwtMiddleware(secret: string) {
  return (req: Request & { userId?: string }, res: Response, next: NextFunction): void => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    try {
      req.userId = verifyJwt(auth.slice(7), secret);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
