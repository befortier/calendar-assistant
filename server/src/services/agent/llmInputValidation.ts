import type { EventReminder, RecurrenceScope } from '../googleCalendar';

const VALID_RECURRENCE_SCOPES: RecurrenceScope[] = ['this', 'this_and_following', 'all'];

/**
 * Asserts that `v` is a string and returns it.
 * Throws a descriptive error referencing `field` if the assertion fails.
 */
export function asString(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`expected string for '${field}', got ${typeof v}`);
  return v;
}

/**
 * Parses `v` as an ISO 8601 date string and returns a `Date`.
 * Throws if `v` is not a string or does not produce a valid date.
 */
export function asDate(v: unknown, field: string): Date {
  const s = asString(v, field);
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`invalid ISO 8601 date for '${field}'`);
  return d;
}

/**
 * Asserts that `v` is a `string[]` and returns it.
 * Throws if `v` is not an array or any element is not a string.
 */
export function asStringArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))
    throw new Error(`expected string[] for '${field}'`);
  return v;
}

/**
 * Asserts that `v` is one of the valid `RecurrenceScope` values and returns it.
 * Throws with the invalid value in the message to aid debugging.
 */
export function asRecurrenceScope(v: unknown): RecurrenceScope {
  const raw = asString(v, 'recurrence_scope');
  if (!(VALID_RECURRENCE_SCOPES as string[]).includes(raw))
    throw new Error(`invalid recurrence_scope '${raw}'`);
  return raw as RecurrenceScope;
}

/**
 * Parses `v` as an array of `EventReminder` objects `{ method, minutes }`.
 * Throws if the array shape is wrong or any element is malformed.
 */
export function asReminders(v: unknown, field: string): EventReminder[] {
  if (!Array.isArray(v)) throw new Error(`expected array for '${field}'`);
  return v.map((r, i) => {
    if (typeof r !== 'object' || r === null)
      throw new Error(`expected object at ${field}[${i}]`);
    const obj = r as Record<string, unknown>;
    if (typeof obj.minutes !== 'number')
      throw new Error(`expected number for '${field}[${i}].minutes'`);
    const method = asString(obj.method, `${field}[${i}].method`);
    if (method !== 'email' && method !== 'popup')
      throw new Error(`expected 'email' | 'popup' for '${field}[${i}].method', got '${method}'`);
    return { method, minutes: obj.minutes };
  });
}
