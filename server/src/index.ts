import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { EncryptionManager } from './crypto';
import { DatabaseClient } from './db/client';
import { runMigrations } from './db/migrate';

dotenv.config();

const REQUIRED_ENV = [
  'TOKEN_ENCRYPTION_KEY',
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'ANTHROPIC_API_KEY',
];

const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const encryption = new EncryptionManager(process.env.TOKEN_ENCRYPTION_KEY!);
const db = new DatabaseClient(encryption, path.join(__dirname, '../data/calendar.db'));
runMigrations(db);

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { db };
