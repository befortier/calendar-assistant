import { describe, it, expect } from 'vitest';
import { asString, asDate, asStringArray, asRecurrenceScope, asReminders } from './llmInputValidation';

// ---------------------------------------------------------------------------
// asString
// ---------------------------------------------------------------------------

describe('asString', () => {
  it('returns the value when it is a string', () => {
    expect(asString('hello', 'field')).toBe('hello');
  });

  it('returns empty string', () => {
    expect(asString('', 'field')).toBe('');
  });

  it('throws when value is a number', () => {
    expect(() => asString(42, 'title')).toThrow("expected string for 'title', got number");
  });

  it('throws when value is null', () => {
    expect(() => asString(null, 'id')).toThrow("expected string for 'id', got object");
  });

  it('throws when value is undefined', () => {
    expect(() => asString(undefined, 'start')).toThrow("expected string for 'start', got undefined");
  });

  it('throws when value is an array', () => {
    expect(() => asString([], 'title')).toThrow("expected string for 'title', got object");
  });
});

// ---------------------------------------------------------------------------
// asDate
// ---------------------------------------------------------------------------

describe('asDate', () => {
  it('parses a valid ISO 8601 UTC string', () => {
    const d = asDate('2026-03-22T09:00:00Z', 'start');
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe('2026-03-22T09:00:00.000Z');
  });

  it('parses a date-only string', () => {
    const d = asDate('2026-03-22', 'start');
    expect(d).toBeInstanceOf(Date);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it('throws when the string is not a valid date', () => {
    expect(() => asDate('not-a-date', 'start')).toThrow("invalid ISO 8601 date for 'start'");
  });

  it('throws when value is a number instead of a string', () => {
    expect(() => asDate(1234567890, 'end')).toThrow("expected string for 'end'");
  });
});

// ---------------------------------------------------------------------------
// asStringArray
// ---------------------------------------------------------------------------

describe('asStringArray', () => {
  it('returns the array when all elements are strings', () => {
    expect(asStringArray(['a@x.com', 'b@x.com'], 'emails')).toEqual(['a@x.com', 'b@x.com']);
  });

  it('returns an empty array', () => {
    expect(asStringArray([], 'attendees')).toEqual([]);
  });

  it('throws when value is a plain string', () => {
    expect(() => asStringArray('a@x.com', 'emails')).toThrow("expected string[] for 'emails'");
  });

  it('throws when array contains a non-string element', () => {
    expect(() => asStringArray(['a@x.com', 42], 'emails')).toThrow("expected string[] for 'emails'");
  });

  it('throws when value is null', () => {
    expect(() => asStringArray(null, 'attendees')).toThrow("expected string[] for 'attendees'");
  });
});

// ---------------------------------------------------------------------------
// asRecurrenceScope
// ---------------------------------------------------------------------------

describe('asRecurrenceScope', () => {
  it("returns 'this' unchanged", () => {
    expect(asRecurrenceScope('this')).toBe('this');
  });

  it("returns 'this_and_following' unchanged", () => {
    expect(asRecurrenceScope('this_and_following')).toBe('this_and_following');
  });

  it("returns 'all' unchanged", () => {
    expect(asRecurrenceScope('all')).toBe('all');
  });

  it('throws for an unrecognised scope value', () => {
    expect(() => asRecurrenceScope('allEvents')).toThrow("invalid recurrence_scope 'allEvents'");
  });

  it('throws when value is not a string', () => {
    expect(() => asRecurrenceScope(123)).toThrow("expected string for 'recurrence_scope'");
  });
});

// ---------------------------------------------------------------------------
// asReminders
// ---------------------------------------------------------------------------

describe('asReminders', () => {
  it('parses a valid reminder array', () => {
    expect(asReminders([{ method: 'popup', minutes: 15 }], 'reminders')).toEqual([
      { method: 'popup', minutes: 15 },
    ]);
  });

  it('parses multiple reminders', () => {
    const result = asReminders(
      [{ method: 'popup', minutes: 10 }, { method: 'email', minutes: 60 }],
      'reminders',
    );
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ method: 'email', minutes: 60 });
  });

  it('returns an empty array for an empty input', () => {
    expect(asReminders([], 'reminders')).toEqual([]);
  });

  it('throws when value is not an array', () => {
    expect(() => asReminders('popup', 'reminders')).toThrow("expected array for 'reminders'");
  });

  it('throws when an element is not an object', () => {
    expect(() => asReminders(['popup'], 'reminders')).toThrow("expected object at reminders[0]");
  });

  it('throws when minutes is missing', () => {
    expect(() => asReminders([{ method: 'popup' }], 'reminders')).toThrow(
      "expected number for 'reminders[0].minutes'",
    );
  });

  it('throws when minutes is a string instead of a number', () => {
    expect(() => asReminders([{ method: 'popup', minutes: '15' }], 'reminders')).toThrow(
      "expected number for 'reminders[0].minutes'",
    );
  });
});
