import { describe, it, expect } from 'vitest';
import { stripRecurrenceSuffix, truncateRruleUntil } from './recurrence';

// ---------------------------------------------------------------------------
// stripRecurrenceSuffix
// ---------------------------------------------------------------------------

describe('stripRecurrenceSuffix', () => {
  it('strips _YYYYMMDDTHHMMSSZ suffix from instance event ID', () => {
    expect(stripRecurrenceSuffix('master_20260322T090000Z')).toBe('master');
  });

  it('strips _YYYYMMDD suffix from date-only instance ID', () => {
    expect(stripRecurrenceSuffix('master_20260322')).toBe('master');
  });

  it('returns the ID unchanged when there is no instance suffix', () => {
    expect(stripRecurrenceSuffix('masteronly')).toBe('masteronly');
  });
});

// ---------------------------------------------------------------------------
// truncateRruleUntil
// ---------------------------------------------------------------------------

describe('truncateRruleUntil', () => {
  it('appends UNTIL one second before instance start', () => {
    const result = truncateRruleUntil('RRULE:FREQ=WEEKLY;BYDAY=MO', 'master_20260322T090000Z');

    expect(result).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260322T085959Z');
  });

  it('replaces existing UNTIL clause', () => {
    const result = truncateRruleUntil(
      'RRULE:UNTIL=20261231T235959Z;FREQ=WEEKLY;BYDAY=MO',
      'master_20260322T090000Z',
    );

    expect(result).not.toMatch(/UNTIL=20261231/);
    expect(result).toMatch(/UNTIL=20260322T085959Z/);
    expect(result).toMatch(/FREQ=WEEKLY/);
  });

  it('replaces existing COUNT clause', () => {
    const result = truncateRruleUntil(
      'RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO',
      'master_20260322T090000Z',
    );

    expect(result).not.toMatch(/COUNT=/);
    expect(result).toMatch(/UNTIL=20260322T085959Z/);
  });

  it('returns the original RRULE when instance ID has no suffix', () => {
    const rrule = 'RRULE:FREQ=WEEKLY;BYDAY=MO';
    expect(truncateRruleUntil(rrule, 'masteronly')).toBe(rrule);
  });

  it('produces valid RRULE format (starts with RRULE:, no double semicolons)', () => {
    const result = truncateRruleUntil(
      'RRULE:UNTIL=20261231T235959Z;FREQ=WEEKLY;BYDAY=MO',
      'master_20260322T090000Z',
    );

    expect(result).toMatch(/^RRULE:/);
    expect(result).not.toMatch(/RRULE:;/);
    expect(result).not.toMatch(/;;/);
  });
});
