import { z } from 'zod';

export const envSchema = z.object({
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be a 64-character hex string (32 bytes)'),
  JWT_SECRET:           z.string().min(1),
  GOOGLE_CLIENT_ID:     z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ANTHROPIC_API_KEY:    z.string().min(1),
  PORT:                 z.string().default('3001'),
  ALLOWED_ORIGIN:       z.string().default('http://localhost:5173'),
});

export type Config = z.infer<typeof envSchema>;
