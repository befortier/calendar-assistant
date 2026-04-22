import { describe, it, expect, vi } from 'vitest';
import { mapWithConcurrency } from './concurrency';

/** Manual promise gate — resolves/rejects on demand so we can interleave scheduling. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('mapWithConcurrency', () => {
  it('returns [] for empty input', async () => {
    const fn = vi.fn();
    expect(await mapWithConcurrency([], 3, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('preserves output order matching input order when tasks finish out of order', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      // Reverse the natural completion order: larger numbers finish sooner.
      await new Promise((r) => setTimeout(r, (5 - n) * 5));
      return n * 10;
    });

    expect(result).toEqual([10, 20, 30, 40]);
  });

  it('never runs more than `limit` tasks in flight simultaneously', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const gates = Array.from({ length: 6 }, () => deferred<void>());

    const runPromise = mapWithConcurrency(gates, 3, async (gate) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate.promise;
      inFlight--;
      return 'ok';
    });

    // Yield so scheduling can fill to the cap.
    await new Promise((r) => setImmediate(r));
    expect(inFlight).toBe(3);

    // Release tasks one at a time.
    gates[0].resolve();
    await new Promise((r) => setImmediate(r));
    gates[1].resolve();
    await new Promise((r) => setImmediate(r));
    gates.slice(2).forEach((g) => g.resolve());

    const results = await runPromise;

    expect(results).toHaveLength(6);
    expect(maxInFlight).toBe(3);
  });

  it('runs all tasks in parallel when limit >= items.length', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const gates = Array.from({ length: 3 }, () => deferred<void>());

    const runPromise = mapWithConcurrency(gates, 10, async (gate) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate.promise;
      inFlight--;
      return 'ok';
    });
    await new Promise((r) => setImmediate(r));
    expect(maxInFlight).toBe(3);

    gates.forEach((g) => g.resolve());
    await runPromise;
  });

  it('runs sequentially when limit=1', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency([1, 2, 3], 1, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight--;
    });

    expect(maxInFlight).toBe(1);
  });

  it('rejects if any task rejects (Promise.all semantics)', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });

  it('passes index to the mapper', async () => {
    const seen: number[] = [];
    await mapWithConcurrency(['a', 'b', 'c'], 2, async (_item, i) => {
      seen.push(i);
    });
    expect(seen.sort()).toEqual([0, 1, 2]);
  });
});
