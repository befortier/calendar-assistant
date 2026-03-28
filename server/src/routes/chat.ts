import { Router } from 'express';
import { z } from 'zod';
import type { IUserRepository } from '../db/user-repository';
import type { GoogleCalendarService } from '../services/googleCalendar';
import { runAgentLoop } from '../services/agent/agentLoop';
import { calendarTools } from '../services/agent/tools';
import { buildSystemPrompt } from '../services/agent/systemPrompt';
import { dispatchTool } from '../services/calendarSkill';
import { formatSSE } from '../services/sse';
import type { LLMProvider } from '../services/agent/types';

export interface ChatRouterDeps {
  users: IUserRepository;
  provider: LLMProvider;
  calendarServiceFactory: (accessToken: string, refreshToken: string) => GoogleCalendarService;
}

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  timezone: z.string(),
});

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const userId = (req as unknown as { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = deps.users.getUserById(userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const calendarService = deps.calendarServiceFactory(
      user.accessToken,
      user.refreshToken ?? '',
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let closed = false;
    res.on('close', () => {
      closed = true;
    });

    try {
      await runAgentLoop(
        parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
        {
          provider: deps.provider,
          tools: calendarTools,
          dispatchTool: (name, input) => dispatchTool(name, input, calendarService),
          buildSystemPrompt: () =>
            buildSystemPrompt({ email: user.email, timezone: parsed.data.timezone }),
        },
        (event) => {
          if (!closed) res.write(formatSSE(event));
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (!closed) {
        res.write(
          formatSSE({ event: 'error', data: { message } }),
        );
      }
    } finally {
      res.end();
    }
  });

  return router;
}
