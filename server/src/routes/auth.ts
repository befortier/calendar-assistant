import { Router } from 'express';
import type { IUserRepository } from '../db/user-repository';
import { signJwt } from '../auth/jwt';

export interface GoogleTokenResult {
  googleId: string;
  email: string;
  accessToken: string;
  refreshToken: string | null;
}

interface AuthRouterDeps {
  users: IUserRepository;
  jwtSecret: string;
  tokenExchanger: (code: string) => Promise<GoogleTokenResult>;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();

  router.post('/google', async (req, res) => {
    const { code } = req.body as Record<string, unknown>;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing or invalid code' });
      return;
    }

    try {
      const { googleId, email, accessToken, refreshToken } = await deps.tokenExchanger(code);
      const userId = deps.users.upsertUser(googleId, email, accessToken, refreshToken);
      const token = signJwt(userId, deps.jwtSecret);
      res.json({ token });
    } catch (err) {
      console.error('Auth error:', err);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  return router;
}
