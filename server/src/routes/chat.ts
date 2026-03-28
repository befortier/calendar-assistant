import { Router } from 'express';
import { z } from 'zod';
import type { IUserRepository } from '../db/user-repository';
import type { GoogleCalendarService } from '../services/googleCalendar';
import { runAgentLoop } from '../services/agent/agentLoop';
import { calendarTools } from '../services/agent/tools';
import { buildSystemPrompt } from '../services/agent/systemPrompt';
import { dispatchTool } from '../services/calendarSkill';
import { formatSSE, SSEEventType } from '../services/sse';
import type { LLMProvider } from '../services/agent/types';

export interface ChatRouterDeps {
  users: IUserRepository;
  provider: LLMProvider;
  calendarServiceFactory: (accessToken: string, refreshToken: string) => GoogleCalendarService;
}

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
      const chatMessages: import('../services/agent/types').ChatMessage[] = parsed.data.messages.map((m) => {
        if (m.role === 'assistant') {
          return { role: 'assistant' as const, text: m.content, toolCalls: [] };
        }
        const msg: import('../services/agent/types').ChatMessage = { role: 'user' as const, content: m.content };
        if (m.metadata) {
          (msg as { metadata?: Record<string, unknown> }).metadata = m.metadata;
          console.log('[chat] user message has metadata:', JSON.stringify(m.metadata));
        }
        return msg;
      });
      await runAgentLoop(
        chatMessages,
        {
          provider: deps.provider,
          tools: calendarTools,
          dispatchTool: (name, input) => dispatchTool(name, input, calendarService, parsed.data.timezone),
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
          formatSSE({ event: SSEEventType.Error, data: { message } }),
        );
      }
    } finally {
      res.end();
    }
  });

  return router;
}
