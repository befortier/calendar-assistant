import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getAuthenticatedUser } from '../middleware/requireUser';
import type { CalendarServiceFactory } from '../services/tools/calendar/google';

export interface CalendarsRouterDeps {
  calendarServiceFactory: CalendarServiceFactory;
}

export function createCalendarsRouter(deps: CalendarsRouterDeps): Router {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const user = getAuthenticatedUser(req);

    try {
      const service = deps.calendarServiceFactory(user.accessToken, user.refreshToken);
      const calendars = await service.listCalendars();
      res.json({ calendars });
    } catch (err) {
      console.error('Calendars error:', err);
      res.status(502).json({ error: 'Failed to fetch calendars from Google' });
    }
  }));

  return router;
}
