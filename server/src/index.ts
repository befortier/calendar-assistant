import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { EncryptionManager } from './crypto';
import { DatabaseClient } from './db/client';
import { runMigrations } from './db/migrate';

const encryption = new EncryptionManager(config.TOKEN_ENCRYPTION_KEY);
const db = new DatabaseClient(encryption, path.join(__dirname, '../data/calendar.db'));
runMigrations(db);

const app = express();

app.use(cors({ origin: config.ALLOWED_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
