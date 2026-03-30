import { Router } from 'express';
import type { IUserRepository } from '../db/user-repository';
import type { CalendarServiceFactory } from '../services/tools/calendar/google';

export interface CalendarsRouterDeps {
  users: IUserRepository;
  calendarServiceFactory: CalendarServiceFactory;
}

export function createCalendarsRouter(deps: CalendarsRouterDeps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = deps.users.getUserById(userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    if (!user.refreshToken) {
      res.status(401).json({ error: 'Google session expired — please reauthorize' });
      return;
    }

    try {
      const service = deps.calendarServiceFactory(user.accessToken, user.refreshToken);
      const calendars = await service.listCalendars();
      res.json({ calendars });
    } catch {
      res.status(502).json({ error: 'Failed to fetch calendars from Google' });
    }
  });

  return router;
}
