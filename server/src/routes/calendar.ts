import { Router } from 'express';
import type { IUserRepository } from '../db/user-repository';
import type { GoogleCalendarService } from '../services/googleCalendar';

export interface CalendarRouterDeps {
  users: IUserRepository;
  calendarServiceFactory: (accessToken: string, refreshToken: string) => GoogleCalendarService;
}

export function createCalendarRouter(deps: CalendarRouterDeps): Router {
  const router = Router();

  router.get('/events', async (req, res) => {
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
      const calendarService = deps.calendarServiceFactory(user.accessToken, user.refreshToken);
      const events = await calendarService.getEvents(startDate, endDate);
      res.json({ events });
    } catch (err) {
      console.error('Calendar error:', err);
      res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
  });

  return router;
}
