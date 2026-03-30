import type { Request, Response, NextFunction } from 'express';
import type { IUserRepository, User } from '../db/user-repository';

/** A user record with refresh token guaranteed present (validated by requireUser). */
export interface AuthenticatedUser extends User {
  refreshToken: string;
}

/** Augment the request with the resolved user after middleware runs. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware that resolves req.userId → full user record, including token validation.
 * Downstream handlers access `req.authenticatedUser` which is guaranteed to have
 * a refreshToken (the middleware rejects the request otherwise).
 */
export function requireUser(users: IUserRepository) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = users.getUserById(userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    if (!user.refreshToken) {
      res.status(401).json({ error: 'Google session expired — please reauthorize' });
      return;
    }

    req.authenticatedUser = user as AuthenticatedUser;
    next();
  };
}

/**
 * Helper to access the authenticated user in a handler.
 * Only call this in routes that are behind the requireUser middleware.
 */
export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  const user = req.authenticatedUser;
  if (!user) {
    throw new Error('requireUser middleware was not applied to this route');
  }
  return user;
}
