import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, ClaudeService } from './claude';
import type { GoogleCalendarService } from './googleCalendar';

function mockAnthropicClient(response: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue(response),
    },
  } as unknown as Anthropic;
}

function mockCalendarService(): GoogleCalendarService {
  return {
    getEvents: vi.fn(),
    getFreeBusy: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  } as unknown as GoogleCalendarService;
}

const CTX = { email: 'alice@example.com', timezone: 'America/New_York', now: new Date('2026-03-25T10:00:00Z') };

describe('buildSystemPrompt', () => {
  it('includes the user email', () => {
    const prompt = buildSystemPrompt(CTX);
    expect(prompt).toContain('alice@example.com');
  });

  it('includes the current date', () => {
    const prompt = buildSystemPrompt(CTX);
    expect(prompt).toContain('2026-03-25');
  });

  it('includes the timezone', () => {
    const prompt = buildSystemPrompt(CTX);
    expect(prompt).toContain('America/New_York');
  });

  it('includes write-confirmation instructions', () => {
    const prompt = buildSystemPrompt(CTX);
    expect(prompt).toMatch(/confirm/i);
    expect(prompt).toMatch(/create_event|update_event|delete_event/);
  });
});
