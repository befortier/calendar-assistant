import type { BusyBlock, FreeSlot } from './google/types';

// ---------------------------------------------------------------------------
// Pure utility — invert a list of busy blocks into free windows within a range.
// Use getFreeBusy([userEmail], start, end) to get busy blocks for the current
// user, then pass the result through invertBusy to obtain their free slots.
// ---------------------------------------------------------------------------
export function invertBusy(busy: BusyBlock[], start: Date, end: Date): FreeSlot[] {
  const intervals = busy
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .sort((a, b) => a.start - b.start);

  // Merge overlapping/touching intervals
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  // Find gaps between merged blocks within [start, end]
  const slots: FreeSlot[] = [];
  let cursor = start.getTime();

  for (const block of merged) {
    if (cursor < block.start) {
      slots.push({ start: new Date(cursor).toISOString(), end: new Date(block.start).toISOString() });
    }
    cursor = Math.max(cursor, block.end);
  }

  if (cursor < end.getTime()) {
    slots.push({ start: new Date(cursor).toISOString(), end: end.toISOString() });
  }

  return slots;
}
