import { Router } from 'express';
import { z } from 'zod';
import type { IPreferencesRepository } from '../db/preferences-repository';

export interface PreferencesRouterDeps {
  preferences: IPreferencesRepository;
}

const UpdatePreferencesSchema = z.object({
  content: z.string(),
});

export function createPreferencesRouter(deps: PreferencesRouterDeps): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const content = deps.preferences.getPreferences(userId);
    res.json({ content });
  });

  router.put('/', (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parsed = UpdatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }
    deps.preferences.setPreferences(userId, parsed.data.content);
    res.json({ content: parsed.data.content });
  });

  return router;
}
