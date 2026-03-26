import { Router } from 'express';
import { z } from 'zod';
import type { IUserRepository } from '../db/user-repository';
import type { ClaudeService } from '../services/claude';
import type { GoogleCalendarService } from '../services/googleCalendar';

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1),
  timezone: z.string().default('UTC'),
});

export interface ChatRouterDeps {
  users: IUserRepository;
  claudeService: ClaudeService;
  calendarServiceFactory: (accessToken: string, refreshToken: string) => GoogleCalendarService;
}

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
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
      const reply = await deps.claudeService.runAgentLoop(
        parsed.data.messages,
        calendarService,
        { email: user.email, timezone: parsed.data.timezone },
      );
      res.json({ reply });
    } catch (err) {
      console.error('Chat error:', err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: 'Failed to process chat request' });
    }
  });

  return router;
}
