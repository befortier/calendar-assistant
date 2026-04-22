export interface RetryOptions {
  /** Max attempts including the first. Defaults to 5. */
  maxAttempts?: number;
  /** Initial delay in ms. Defaults to 250. */
  baseDelayMs?: number;
  /** Upper bound on a single delay in ms. Defaults to 8000. */
  maxDelayMs?: number;
  /** Injected for testing — return 0 for deterministic runs. */
  jitter?: () => number;
  /** Injected for testing — replaces setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 8_000;

const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded']);

/**
 * Retries an async fn on transient Google Calendar API failures.
 * Retryable: 429, 5xx, and 403 with a rate-limit/quota reason.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (maxAttempts < 1) throw new Error(`withRetry: maxAttempts must be >= 1, got ${maxAttempts}`);
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitter = opts.jitter ?? defaultJitter;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === maxAttempts - 1) throw err;
      const exp = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      await sleep(exp + jitter());
    }
  }
  // Unreachable — the loop either returns or throws — but TS can't infer that.
  throw lastError;
}

function isRetryable(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  if (status === 403 && RATE_LIMIT_REASONS.has(extractReason(err) ?? '')) return true;
  return false;
}

function extractStatus(err: unknown): number {
  if (!err || typeof err !== 'object') return 0;
  const e = err as { response?: { status?: number }; code?: string | number };
  if (typeof e.response?.status === 'number') return e.response.status;
  const code = Number(e.code);
  return Number.isFinite(code) ? code : 0;
}

function extractReason(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as {
    errors?: { reason?: string }[];
    response?: { data?: { error?: { errors?: { reason?: string }[] } } };
  };
  return e.errors?.[0]?.reason ?? e.response?.data?.error?.errors?.[0]?.reason;
}

function defaultJitter(): number {
  return Math.floor(Math.random() * 250);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
