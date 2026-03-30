import { Router } from 'express';
import { z } from 'zod';
import type { IUserRepository } from '../db/user-repository';
import type { IPreferencesRepository } from '../db/preferences-repository';
import { runAgentLoop } from '../services/agent/agentLoop';
import { calendarTools } from '../services/tools/calendar/tools';
import { buildSystemPrompt } from '../services/agent/systemPrompt';
import { makeCalendarToolDispatcher } from '../services/tools/calendar/dispatcher';
import { formatSSE, SSEEventType } from '../services/sse';
import type { SSEEmitter, SSEEvent } from '../services/sse';
import type { LLMProvider, ChatMessage } from '../services/agent/types';
import type { CalendarServiceFactory, GoogleCalendarService } from '../services/googleCalendar';

export interface ChatRouterDeps {
  users: IUserRepository;
  preferences: IPreferencesRepository;
  provider: LLMProvider;
  calendarServiceFactory: CalendarServiceFactory;
}

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  timezone: z.string().default('UTC').refine((tz) => {
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; } catch { return false; }
  }, { message: 'Invalid IANA timezone' }),
  calendarId: z.string().min(1).max(250).regex(/^[^\r\n]*$/).default('primary'),
  calendarName: z.string().max(100).regex(/^[^\r\n]*$/).optional(),
});

function makeDispatchTool(
  preferencesRepo: IPreferencesRepository,
  userId: string,
  calendarService: GoogleCalendarService,
  timezone: string,
  emit: SSEEmitter,
) {
  const calendarDispatcher = makeCalendarToolDispatcher(calendarService, emit, timezone);
  return (name: string, input: Record<string, unknown>): Promise<string> => {
    if (name === 'update_preferences') {
      const content = typeof input.content === 'string' ? input.content : '';
      preferencesRepo.setPreferences(userId, content);
      return Promise.resolve(JSON.stringify({ saved: true }));
    }
    return calendarDispatcher.dispatch(name, input);
  };
}

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

    if (!user.refreshToken) {
      res.status(401).json({ error: 'Google session expired — please reauthorize' });
      return;
    }

    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const calendarService = deps.calendarServiceFactory(user.accessToken, user.refreshToken, parsed.data.calendarId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let closed = false;
    res.on('close', () => { closed = true; });

    try {
      const emit = (event: SSEEvent): void => { if (!closed) res.write(formatSSE(event)); };
      const chatMessages: ChatMessage[] = parsed.data.messages.map((m): ChatMessage =>
        m.role === 'assistant'
          ? { role: 'assistant', text: m.content, toolCalls: [] }
          : { role: 'user', content: m.content, metadata: m.metadata },
      );
      await runAgentLoop(
        chatMessages,
        {
          provider: deps.provider,
          tools: calendarTools,
          dispatchTool: makeDispatchTool(deps.preferences, userId, calendarService, parsed.data.timezone, emit),
          buildSystemPrompt: () =>
            buildSystemPrompt({
              email: user.email,
              timezone: parsed.data.timezone,
              preferences: deps.preferences.getPreferences(userId),
              calendarId: parsed.data.calendarId,
              calendarName: parsed.data.calendarName,
            }),
        },
        emit,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (!closed) res.write(formatSSE({ event: SSEEventType.Error, data: { message } }));
    } finally {
      res.end();
    }
  });

  return router;
}
