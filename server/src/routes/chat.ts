import { Router } from 'express';
import { z } from 'zod';
import type { IUserRepository } from '../db/user-repository';
import type { ClaudeService } from '../services/claude';
import type { GoogleCalendarService } from '../services/googleCalendar';
import { formatSSE } from '../services/sse';

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

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let closed = false;
    res.on('close', () => { closed = true; });

    const calendarService = deps.calendarServiceFactory(user.accessToken, user.refreshToken);

    try {
      await deps.claudeService.streamAgentLoop(
        parsed.data.messages,
        calendarService,
        { email: user.email, timezone: parsed.data.timezone },
        (event) => {
          if (!closed) res.write(formatSSE(event));
        },
      );
    } catch (err) {
      if (!closed) {
        res.write(formatSSE({ event: 'error', data: { message: 'Failed to process chat request' } }));
        res.write(formatSSE({ event: 'done', data: {} }));
      }
      console.error('Chat error:', err);
    }

    if (!closed) res.end();
  });

  return router;
}
