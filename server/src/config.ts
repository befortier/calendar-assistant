import dotenv from 'dotenv';
import { envSchema } from './env-schema';

dotenv.config();

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues.map(i => `  ${String(i.path[0])}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = result.data;
