# Calendar API Gaps Design

> **For Claude:** After human approval, use plan2beads to convert this plan to a beads epic, then use `superpowers-bd:subagent-driven-development` for parallel execution.

**Goal:** Close the high and medium gaps between our Google Calendar integration and the API's capabilities: recurring events, reminders, Google Meet, all-day event creation, and attendee response status.

**Architecture:** All changes are additive to existing service/tool/dispatch layers. Two features (Meet, attendee responses) require zero tool schema changes — they're server-side only. The LLM's tool surface grows by 4 optional fields across create/update.

**Tech Stack:** TypeScript, Google Calendar API v3, Vitest

**Key Decisions:**
- **Recurring events: create-only (B)** — support creating daily/weekly/monthly recurrences via RRULE. Instance modification (edit/delete single occurrence) deferred to a follow-up.
- **Google Meet: auto-attach when attendees present (C)** — no tool schema change. Server adds conferenceData automatically. Solo events (no attendees) get no Meet link.
- **Calendar selection: deferred (C)** — requires a new `list_calendars` tool. Lower value than the other 5 gaps. Primary calendar covers most use cases.
- **Attendee responses: read-only enrichment** — return `{ email, responseStatus }` objects instead of plain strings. Breaking change to `CalendarEvent.attendees` type, requires frontend update.

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `server/src/services/googleCalendar.ts` | Service layer: CalendarEvent, CreateEventInput, UpdateEventInput, normalizeEvent, createEvent, updateEvent | Modify |
| `server/src/services/agent/tools.ts` | Tool schemas: create_event, update_event | Modify |
| `server/src/services/calendarSkill.ts` | Dispatch: forward new fields | Modify |
| `server/src/services/googleCalendar.test.ts` | Service tests | Modify |
| `server/src/services/calendarSkill.test.ts` | Dispatch tests | Modify |
| `app/src/lib/sse.ts` | Frontend CalendarEvent type | Modify |
| `app/src/components/EventCard.tsx` | Attendee display (string[] → AttendeeInfo[]) | Modify |

---

## 1. Recurring Events (Create-only)

### Service layer (`googleCalendar.ts`)

`CreateEventInput` gets:
```ts
recurrence?: string[]; // ['RRULE:FREQ=WEEKLY;BYDAY=MO']
```

`CalendarEvent` gets:
```ts
recurrence?: string[];
```

`createEvent` passes `recurrence` to `requestBody`.

`normalizeEvent` extracts `event.recurrence` from Google response.

### Tool schema (`tools.ts`)

`create_event` gets:
```ts
recurrence: {
  type: 'array',
  items: { type: 'string' },
  description: 'Recurrence rules in RFC 5545 RRULE format (e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO"])'
}
```

### Dispatch (`calendarSkill.ts`)

```ts
recurrence: input.recurrence != null ? asStringArray(input.recurrence, 'recurrence') : undefined,
```

---

## 2. Reminders

### Service layer (`googleCalendar.ts`)

New type:
```ts
interface EventReminder {
  method: 'email' | 'popup';
  minutes: number;
}
```

`CreateEventInput` and `UpdateEventInput` get:
```ts
reminders?: EventReminder[];
```

`CalendarEvent` gets:
```ts
reminders?: EventReminder[];
```

`createEvent`/`updateEvent` translate:
```ts
reminders: input.reminders
  ? { useDefault: false, overrides: input.reminders }
  : undefined,
```

`normalizeEvent` extracts `event.reminders?.overrides` (skip if `useDefault` is true).

### Tool schema (`tools.ts`)

`create_event` and `update_event` get:
```ts
reminders: {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      method: { type: 'string', description: '"email" or "popup"' },
      minutes: { type: 'number', description: 'Minutes before event (0-40320)' },
    },
  },
  description: 'Custom reminders. Omit to use calendar defaults.'
}
```

### Dispatch (`calendarSkill.ts`)

Validate array of objects with `method` (string) and `minutes` (number), forward.

---

## 3. Google Meet (Auto-attach)

### Service layer only (`googleCalendar.ts`)

In `createEvent`, when `input.attendees?.length > 0`:
```ts
requestBody.conferenceData = {
  createRequest: {
    requestId: crypto.randomUUID(),
    conferenceSolutionKey: { type: 'hangoutsMeet' },
  },
};
```

Pass `conferenceDataVersion: 1` to `events.insert`.

`CalendarEvent` gets:
```ts
meetLink?: string;
```

`normalizeEvent` extracts:
```ts
const meetLink = event.conferenceData?.entryPoints
  ?.find((ep) => ep.entryPointType === 'video')?.uri ?? undefined;
```

### No tool schema or dispatch changes.

---

## 4. All-day Event Creation

### Service layer (`googleCalendar.ts`)

`CreateEventInput` and `UpdateEventInput` get:
```ts
allDay?: boolean;
```

In `createEvent`/`updateEvent`:
```ts
start: input.allDay ? { date: input.start } : { dateTime: input.start },
end: input.allDay ? { date: input.end } : { dateTime: input.end },
```

### Tool schema (`tools.ts`)

`create_event` and `update_event` get:
```ts
allDay: { type: 'boolean', description: 'True for all-day events (start/end should be YYYY-MM-DD)' }
```

### Dispatch (`calendarSkill.ts`)

```ts
allDay: input.allDay != null ? Boolean(input.allDay) : undefined,
```

---

## 5. Attendee Response Status

### Service layer (`googleCalendar.ts`)

New type:
```ts
interface AttendeeInfo {
  email: string;
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
}
```

`CalendarEvent.attendees` changes from `string[]` to `AttendeeInfo[]`.

`normalizeEvent`:
```ts
const attendees = event.attendees
  ?.map((a) => ({ email: a.email!, responseStatus: a.responseStatus as AttendeeInfo['responseStatus'] }))
  .filter((a) => Boolean(a.email));
```

### Frontend changes

`app/src/lib/sse.ts` — update `CalendarEvent.attendees` type.

`app/src/components/EventCard.tsx` — change `attendees.join(', ')` to `attendees.map(a => a.email).join(', ')`.

### No tool schema or dispatch changes for reading.

`create_event` and `update_event` tool schemas still accept `string[]` for attendees input (just emails). The enriched response is read-only.

---

## Testing

- **Recurring events:** Test createEvent passes recurrence array to Google, normalizeEvent extracts it.
- **Reminders:** Test createEvent/updateEvent translate reminders to Google format, normalizeEvent extracts overrides.
- **Google Meet:** Test createEvent adds conferenceData when attendees present, skips when absent. Test normalizeEvent extracts meetLink.
- **All-day events:** Test createEvent uses `{ date }` when allDay=true, `{ dateTime }` when false.
- **Attendee responses:** Test normalizeEvent returns `{ email, responseStatus }` objects. Test frontend EventCard renders correctly.
