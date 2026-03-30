import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp';
import { parseSSEStream, eventSequence, collectDeltaText } from './helpers/parseSSEStream';
import type { StreamResult } from '../../services/agent/types';

import happyPathFixture from './fixtures/happy-path-chat.json';
import toolCallFixture from './fixtures/tool-call-round-trip.json';
import singleProposalFixture from './fixtures/single-proposal-flow.json';
import batchProposalFixture from './fixtures/batch-proposal-flow.json';

/** Cast fixture llmBeats to StreamResult[] (JSON imports are untyped). */
function beats(raw: unknown): StreamResult[] {
  return raw as StreamResult[];
}

function sendChat(app: ReturnType<typeof createTestApp>['app'], token: string, messages: unknown[]) {
  return request(app)
    .post('/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ messages, timezone: 'America/New_York' });
}

describe('Integration: chat flow', () => {
  describe('Scenario 1: Happy path chat', () => {
    it('streams a text response with status → delta → done', async () => {
      const fixture = happyPathFixture.requests[0];
      const { app, token, provider } = createTestApp({
        llmBeats: beats(fixture.llmBeats),
      });

      const res = await sendChat(app, token, fixture.messages);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const events = parseSSEStream(res.text);
      expect(eventSequence(events)).toEqual(fixture.expectedEvents);

      const text = collectDeltaText(events);
      expect(text).toBe("Hi! I'm your calendar assistant. How can I help you today?");

      expect(provider.callCount).toBe(1);
    });
  });

  describe('Scenario 2: Single proposal flow', () => {
    it('proposes an event then creates it on acceptance', async () => {
      const [proposeReq, acceptReq] = singleProposalFixture.requests;
      const { app, token, provider, calendarApi } = createTestApp({
        llmBeats: beats(proposeReq.llmBeats),
      });

      // Request 1: Propose
      const res1 = await sendChat(app, token, proposeReq.messages);
      expect(res1.status).toBe(200);

      const events1 = parseSSEStream(res1.text);
      expect(eventSequence(events1)).toEqual(proposeReq.expectedEvents);

      // Verify the event_proposal payload
      const proposal = events1.find((e) => e.event === 'event_proposal');
      expect(proposal).toBeDefined();
      expect(proposal!.data).toMatchObject({
        action: 'create',
        event: expect.objectContaining({
          title: 'Meeting with Alice',
          start: expect.stringContaining('2026-04-01'),
        }),
      });

      const text1 = collectDeltaText(events1);
      expect(text1).toContain('proposed');

      // Request 2: Accept — agent calls create_event
      provider.loadBeats(beats(acceptReq.llmBeats));
      const res2 = await sendChat(app, token, acceptReq.messages);
      expect(res2.status).toBe(200);

      const events2 = parseSSEStream(res2.text);
      expect(eventSequence(events2)).toEqual(acceptReq.expectedEvents);

      // Verify create_event was dispatched through the real GoogleCalendarService
      const toolCall = events2.find((e) => e.event === 'tool_call');
      expect(toolCall!.data).toEqual({ tool: 'create_event' });

      const toolResult = events2.find((e) => e.event === 'tool_result');
      expect(toolResult!.data).toMatchObject({ tool: 'create_event', summary: 'Completed' });

      // Verify the mock calendar API was called
      expect(calendarApi.events.insert).toHaveBeenCalled();

      const text2 = collectDeltaText(events2);
      expect(text2).toContain('created');
    });
  });

  describe('Scenario 3: Batch proposal flow', () => {
    it('proposes batch delete then deletes accepted events', async () => {
      const [proposeReq, acceptReq] = batchProposalFixture.requests;
      const { app, token, provider, calendarApi } = createTestApp({
        calendarEvents: batchProposalFixture.calendar.events,
        llmBeats: beats(proposeReq.llmBeats),
      });

      // Request 1: Fetch events + propose batch delete
      const res1 = await sendChat(app, token, proposeReq.messages);
      expect(res1.status).toBe(200);

      const events1 = parseSSEStream(res1.text);
      expect(eventSequence(events1)).toEqual(proposeReq.expectedEvents);

      // Verify get_events was called
      const getEventsCall = events1.find(
        (e) => e.event === 'tool_call' && (e.data as { tool: string }).tool === 'get_events',
      );
      expect(getEventsCall).toBeDefined();

      // Verify batch_proposal with 3 entries
      const batch = events1.find((e) => e.event === 'batch_proposal');
      expect(batch).toBeDefined();
      const batchData = batch!.data as { batchId: string; entries: unknown[] };
      expect(batchData.entries).toHaveLength(3);

      // Request 2: Accept 2 of 3 — agent deletes them
      provider.loadBeats(beats(acceptReq.llmBeats));
      const res2 = await sendChat(app, token, acceptReq.messages);
      expect(res2.status).toBe(200);

      const events2 = parseSSEStream(res2.text);
      expect(eventSequence(events2)).toEqual(acceptReq.expectedEvents);

      // Verify two delete_event tool calls
      const deleteCalls = events2.filter(
        (e) => e.event === 'tool_call' && (e.data as { tool: string }).tool === 'delete_event',
      );
      expect(deleteCalls).toHaveLength(2);

      // Verify the mock calendar API received 2 delete calls
      expect(calendarApi.events.delete).toHaveBeenCalledTimes(2);

      const text2 = collectDeltaText(events2);
      expect(text2).toContain('deleted');
    });
  });

  describe('Scenario 4: Tool call round-trip', () => {
    it('calls get_events and uses results in response', async () => {
      const fixture = toolCallFixture.requests[0];
      const { app, token, provider, calendarApi } = createTestApp({
        calendarEvents: toolCallFixture.calendar.events,
        llmBeats: beats(fixture.llmBeats),
      });

      const res = await sendChat(app, token, fixture.messages);
      expect(res.status).toBe(200);

      const events = parseSSEStream(res.text);
      expect(eventSequence(events)).toEqual(fixture.expectedEvents);

      // Verify tool_call for get_events
      const toolCall = events.find((e) => e.event === 'tool_call');
      expect(toolCall!.data).toEqual({ tool: 'get_events' });

      // Verify tool_result
      const toolResult = events.find((e) => e.event === 'tool_result');
      expect(toolResult!.data).toMatchObject({ tool: 'get_events', summary: 'Completed' });

      // Verify the real GoogleCalendarService was exercised
      expect(calendarApi.events.list).toHaveBeenCalled();

      // Verify response text references the events
      const text = collectDeltaText(events);
      expect(text).toContain('Standup');
      expect(text).toContain('Planning');

      expect(provider.callCount).toBe(2);
    });
  });
});
