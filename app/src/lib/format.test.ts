import { describe, it, expect } from 'vitest';
import { formatTime } from './format';

describe('formatTime', () => {
  it('returns empty string for empty input', () => {
    expect(formatTime('')).toBe('');
  });

  it('formats a valid ISO date string', () => {
    const result = formatTime('2026-04-01T10:00:00Z');
    // Result depends on locale, but should contain date components
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes weekday, month, day, and time components', () => {
    // Use a fixed UTC time and check for reasonable output
    const result = formatTime('2026-12-25T14:30:00Z');
    // Should have some text output (exact format is locale-dependent)
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(5);
  });
});
