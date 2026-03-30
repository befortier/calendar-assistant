import { describe, it, expect } from 'vitest';
import { invertBusy } from './algorithms';

const START = new Date('2026-03-22T00:00:00Z');
const END = new Date('2026-03-22T23:59:59Z');

describe('invertBusy', () => {
  it('returns the full range as one free slot when there are no busy blocks', () => {
    const slots = invertBusy([], START, END);
    expect(slots).toEqual([{ start: START.toISOString(), end: END.toISOString() }]);
  });

  it('returns gap between two busy blocks', () => {
    const slots = invertBusy(
      [
        { start: '2026-03-22T09:00:00Z', end: '2026-03-22T10:00:00Z' },
        { start: '2026-03-22T14:00:00Z', end: '2026-03-22T15:00:00Z' },
      ],
      START,
      END,
    );

    expect(slots).toEqual([
      { start: START.toISOString(),        end: '2026-03-22T09:00:00.000Z' },
      { start: '2026-03-22T10:00:00.000Z', end: '2026-03-22T14:00:00.000Z' },
      { start: '2026-03-22T15:00:00.000Z', end: END.toISOString() },
    ]);
  });

  it('merges overlapping busy blocks before computing free windows', () => {
    const slots = invertBusy(
      [
        { start: '2026-03-22T09:00:00Z', end: '2026-03-22T11:00:00Z' },
        { start: '2026-03-22T10:00:00Z', end: '2026-03-22T12:00:00Z' },
      ],
      START,
      END,
    );

    expect(slots).toEqual([
      { start: START.toISOString(),        end: '2026-03-22T09:00:00.000Z' },
      { start: '2026-03-22T12:00:00.000Z', end: END.toISOString() },
    ]);
  });

  it('returns empty array when a single block spans the full range', () => {
    const slots = invertBusy(
      [{ start: START.toISOString(), end: END.toISOString() }],
      START,
      END,
    );
    expect(slots).toEqual([]);
  });
});
