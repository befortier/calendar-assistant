import { describe, it, expect, vi } from 'vitest';
import { withRetry, type RetryOptions } from './retry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mimics a googleapis GaxiosError. */
function googleError(status: number, reason?: string): Error {
  const err = new Error(`HTTP ${status}`) as Error & {
    code: string;
    response: { status: number; data: unknown };
    errors?: { reason: string; domain: string }[];
  };
  err.code = String(status);
  err.response = { status, data: reason ? { error: { errors: [{ reason }] } } : {} };
  if (reason) err.errors = [{ reason, domain: 'usageLimits' }];
  return err;
}

/** Deterministic sleep stub: records durations and resolves synchronously. */
function recordingSleep(): { sleep: (ms: number) => Promise<void>; durations: number[] } {
  const durations: number[] = [];
  return {
    sleep: (ms: number) => {
      durations.push(ms);
      return Promise.resolve();
    },
    durations,
  };
}

/** Zero-jitter so backoff durations are deterministic. */
const zeroJitter = (): number => 0;

/** Common options that make tests deterministic. */
function testOpts(overrides?: Partial<RetryOptions>): RetryOptions & Required<Pick<RetryOptions, 'sleep' | 'jitter'>> {
  return { sleep: recordingSleep().sleep, jitter: zeroJitter, ...overrides };
}

// ---------------------------------------------------------------------------
// Success + non-retryable errors
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  it.each([0, -1, -3])('throws when maxAttempts < 1 (got %d)', async (maxAttempts) => {
    await expect(
      withRetry(async () => 'ok', { ...testOpts(), maxAttempts }),
    ).rejects.toThrow(/maxAttempts must be >= 1/);
  });

  it('returns the value when fn succeeds on first attempt (no retry)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, testOpts());

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 4xx client errors other than 429/rate-limited 403', async () => {
    const fn = vi.fn().mockRejectedValue(googleError(404));

    await expect(withRetry(fn, testOpts())).rejects.toThrow('HTTP 404');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 403 when reason is not rate-limit (e.g. forbidden)', async () => {
    const fn = vi.fn().mockRejectedValue(googleError(403, 'forbidden'));

    await expect(withRetry(fn, testOpts())).rejects.toThrow('HTTP 403');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on plain Errors with no status code', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(withRetry(fn, testOpts())).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Retryable errors
  // ---------------------------------------------------------------------------

  it('retries on 429 and returns the eventual success value', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(googleError(429))
      .mockRejectedValueOnce(googleError(429))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, testOpts({ maxAttempts: 5 }));

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it.each(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'])(
    "retries on 403 with reason '%s'",
    async (reason) => {
      const fn = vi.fn()
        .mockRejectedValueOnce(googleError(403, reason))
        .mockResolvedValueOnce('ok');

      const result = await withRetry(fn, testOpts());

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    },
  );

  it.each([500, 502, 503, 504])('retries on %d (server errors)', async (status) => {
    const fn = vi.fn()
      .mockRejectedValueOnce(googleError(status))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, testOpts());

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after exhausting maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(googleError(429));

    await expect(withRetry(fn, testOpts({ maxAttempts: 3 }))).rejects.toThrow('HTTP 429');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // ---------------------------------------------------------------------------
  // Backoff timing
  // ---------------------------------------------------------------------------

  it('uses exponential backoff: base * 2^attempt', async () => {
    const { sleep, durations } = recordingSleep();
    const fn = vi.fn()
      .mockRejectedValueOnce(googleError(429))
      .mockRejectedValueOnce(googleError(429))
      .mockRejectedValueOnce(googleError(429))
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { sleep, jitter: zeroJitter, maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 10_000 });

    // Base=100: attempt 0 -> sleep 100, attempt 1 -> 200, attempt 2 -> 400 before 4th try
    expect(durations).toEqual([100, 200, 400]);
  });

  it('clamps delay to maxDelayMs', async () => {
    const { sleep, durations } = recordingSleep();
    const fn = vi.fn()
      .mockRejectedValueOnce(googleError(429))
      .mockRejectedValueOnce(googleError(429))
      .mockRejectedValueOnce(googleError(429))
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { sleep, jitter: zeroJitter, maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 1500 });

    expect(durations).toEqual([1000, 1500, 1500]);
  });

  it('adds jitter to each delay', async () => {
    const { sleep, durations } = recordingSleep();
    const fn = vi.fn()
      .mockRejectedValueOnce(googleError(429))
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { sleep, jitter: () => 50, maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 10_000 });

    expect(durations).toEqual([150]);
  });
});
