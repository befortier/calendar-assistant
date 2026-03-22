import express from 'express';
import cors from 'cors';
import { config } from './config';
import { Dependencies } from './dependencies';
import { jwtMiddleware } from './auth/jwt';
import { createAuthRouter } from './routes/auth';
import { makeGoogleTokenExchanger } from './auth/google';

const deps = new Dependencies(config);
deps.migrations.migrate();

const app = express();

app.use(cors({ origin: config.ALLOWED_ORIGIN }));
app.use(express.json());

const tokenExchanger = makeGoogleTokenExchanger(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  `${config.ALLOWED_ORIGIN}/auth/callback`,
);

app.use('/auth', createAuthRouter({ client: deps.client, jwtSecret: config.JWT_SECRET, tokenExchanger }));

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
