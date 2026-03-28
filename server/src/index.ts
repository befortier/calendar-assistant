import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';
import { Dependencies } from './dependencies';
import { jwtMiddleware } from './auth/jwt';
import { createAuthRouter } from './routes/auth';
import { createChatRouter } from './routes/chat';
import { GoogleTokenExchanger, realGoogleAuthFactory } from './auth/google';
import { ClaudeAdapter } from './services/providers/claude/claudeAdapter';
import { createGoogleCalendarService } from './services/googleCalendar';

const deps = new Dependencies(config);
deps.migrations.migrate();

const app = express();

app.use(cors({ origin: config.ALLOWED_ORIGIN }));
app.use(express.json());

const googleExchanger = new GoogleTokenExchanger(
  {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: `${config.ALLOWED_ORIGIN}/auth/callback`,
  },
  realGoogleAuthFactory,
);
const tokenExchanger = googleExchanger.exchangeCode.bind(googleExchanger);

app.use('/auth', createAuthRouter({ users: deps.client, jwtSecret: config.JWT_SECRET, tokenExchanger }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const auth = jwtMiddleware(config.JWT_SECRET);

app.use('/calendar', auth);
app.use('/chat', auth);
app.use('/skills', auth);

const provider = new ClaudeAdapter(new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }), config.ANTHROPIC_MODEL);

app.use(
  '/chat',
  createChatRouter({
    users: deps.client,
    provider,
    calendarServiceFactory: (accessToken, refreshToken) =>
      createGoogleCalendarService(accessToken, refreshToken, config),
  }),
);

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
