import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { getAuthenticatedUser } from '../middleware/requireUser';
import type { GoogleCalendarService } from '../services/tools/calendar/google';

export interface CalendarRouterDeps {
  calendarServiceFactory: (accessToken: string, refreshToken: string) => GoogleCalendarService;
}

export function createCalendarRouter(deps: CalendarRouterDeps): Router {
  const router = Router();

  router.get('/events', asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (typeof start !== 'string' || typeof end !== 'string') {
      res.status(400).json({ error: 'Missing required query parameters: start, end (ISO 8601)' });
      return;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({ error: 'Invalid date format — use ISO 8601' });
      return;
    }

    const user = getAuthenticatedUser(req);

    try {
      const calendarService = deps.calendarServiceFactory(user.accessToken, user.refreshToken);
      const events = await calendarService.getEvents(startDate, endDate);
      res.json({ events });
    } catch (err) {
      console.error('Calendar error:', err);
      res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
  }));

  return router;
}
