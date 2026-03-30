import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';
import { Dependencies } from './dependencies';
import { jwtMiddleware } from './auth/jwt';
import { requireUser } from './middleware/requireUser';
import { AuthenticationError } from './errors';
import { createAuthRouter } from './routes/auth';
import { createChatRouter } from './routes/chat';
import { createPreferencesRouter } from './routes/preferences';
import { createCalendarsRouter } from './routes/calendars';
import { GoogleTokenExchanger, realGoogleAuthFactory } from './auth/google';
import { ClaudeAdapter } from './services/providers/claude/claudeAdapter';
import { createGoogleCalendarService } from './services/tools/calendar/google';

const deps = new Dependencies(config);
deps.migrations.migrate();

const app = express();

app.use(cors({ origin: config.ALLOWED_ORIGIN }));
app.use(express.json({ limit: '100kb' }));

const googleExchanger = new GoogleTokenExchanger(
  {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: 'postmessage',
  },
  realGoogleAuthFactory,
);
const tokenExchanger = googleExchanger.exchangeCode.bind(googleExchanger);

app.use('/auth', createAuthRouter({ users: deps.client, jwtSecret: config.JWT_SECRET, tokenExchanger }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/version', (_req, res) => {
  res.json({
    sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'local',
    branch: process.env.RAILWAY_GIT_BRANCH ?? 'local',
    service: process.env.RAILWAY_SERVICE_NAME ?? 'local',
    deployedAt: process.env.RAILWAY_DEPLOYMENT_ID ? new Date().toISOString() : null,
  });
});

const auth = jwtMiddleware(config.JWT_SECRET);

const userGuard = requireUser(deps.client);
app.use('/calendar', auth, userGuard);
app.use('/calendars', auth, userGuard);
app.use('/chat', auth, userGuard);
app.use('/preferences', auth);

const provider = new ClaudeAdapter(new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }), config.ANTHROPIC_MODEL);

const calendarServiceFactory = (accessToken: string, refreshToken: string, calendarId?: string) =>
  createGoogleCalendarService(accessToken, refreshToken, config, undefined, calendarId);

app.use('/calendars', createCalendarsRouter({ calendarServiceFactory }));

app.use(
  '/chat',
  createChatRouter({
    preferences: deps.preferences,
    provider,
    calendarServiceFactory,
  }),
);

app.use('/preferences', createPreferencesRouter({ preferences: deps.preferences }));

// Centralized error handler — catches unhandled errors from async route handlers
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;

  if (err instanceof AuthenticationError) {
    res.status(401).json({ error: err.message });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
