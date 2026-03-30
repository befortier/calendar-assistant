import express from 'express';
import Database from 'better-sqlite3';
import { MigrationManager } from '../../../db/migrate';
import { EncryptionManager } from '../../../crypto';
import { UserRepository } from '../../../db/user-repository';
import { PreferencesRepository } from '../../../db/preferences-repository';
import { signJwt, jwtMiddleware } from '../../../auth/jwt';
import { createChatRouter } from '../../../routes/chat';
import { GoogleCalendarService } from '../../../services/tools/calendar/google/service';
import { ScriptedProvider } from './scriptedProvider';
import { createMockCalendarApi } from './mockCalendarApi';
import type { calendar_v3 } from 'googleapis';
import type { StreamResult } from '../../../services/agent/types';

const TEST_JWT_SECRET = 'test-jwt-secret-for-integration-tests';
const TEST_ENCRYPTION_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

interface FixtureCalendarEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;
  location?: string;
  description?: string;
}

interface TestAppOptions {
  calendarEvents?: FixtureCalendarEvent[];
  llmBeats?: StreamResult[];
}

export interface TestApp {
  app: express.Express;
  token: string;
  provider: ScriptedProvider;
  calendarApi: calendar_v3.Calendar;
  db: Database.Database;
}

export function createTestApp(options: TestAppOptions = {}): TestApp {
  // Real in-memory database with real migrations
  const db = new Database(':memory:');
  const migrations = new MigrationManager(db);
  migrations.migrate();

  const encryption = new EncryptionManager(TEST_ENCRYPTION_KEY);
  const users = new UserRepository(db, encryption);
  const preferences = new PreferencesRepository(db);

  // Seed a test user with fake tokens
  const userId = users.upsertUser('google-test-123', 'test@example.com', 'fake-access-token', 'fake-refresh-token');
  const token = signJwt(userId, TEST_JWT_SECRET);

  // Scripted LLM provider
  const provider = new ScriptedProvider();
  if (options.llmBeats) {
    provider.loadBeats(options.llmBeats);
  }

  // Mock Google Calendar API — real GoogleCalendarService wraps it
  const calendarApi = createMockCalendarApi(options.calendarEvents ?? []);
  const calendarServiceFactory = () => new GoogleCalendarService(calendarApi);

  // Build real Express app
  const app = express();
  app.use(express.json());

  const auth = jwtMiddleware(TEST_JWT_SECRET);
  app.use('/chat', auth);
  app.use('/chat', createChatRouter({ users, preferences, provider, calendarServiceFactory }));

  return { app, token, provider, calendarApi, db };
}
