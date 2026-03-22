import express from 'express';
import cors from 'cors';
import { config } from './config';
import { Dependencies } from './dependencies';

const deps = new Dependencies(config);
deps.migrations.migrate();

const app = express();

app.use(cors({ origin: config.ALLOWED_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(parseInt(config.PORT), () => {
  console.log(`Server running on port ${config.PORT}`);
});
