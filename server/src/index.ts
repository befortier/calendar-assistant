import express from 'express';
import cors from 'cors';
import { config } from './config';
import { Dependencies } from './dependencies';
import { jwtMiddleware } from './auth/jwt';
import { createAuthRouter } from './routes/auth';
import { GoogleTokenExchanger, realGoogleAuthFactory } from './auth/google';

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

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
