# SSE Streaming & Event Cards Design

## Goal
Replace the current JSON POST /chat response with an SSE stream that provides real-time visibility into the agent loop, streams text token-by-token, and renders calendar write operations as interactive EventCard components with Accept/Decline actions.

## SSE Event Contract

```
event: status
data: {"type": "thinking"}

event: tool_call
data: {"tool": "get_events", "args": {"start": "...", "end": "..."}}

event: tool_result
data: {"tool": "get_events", "summary": "Found 3 events"}

event: delta
data: {"text": "You have"}

event: event_proposal
data: {"id": "prop_abc", "action": "create", "event": {CalendarEvent}}

event: done
data: {}

event: error
data: {"message": "Failed to process request"}
```

### Event Semantics

- `status`: Emitted at the start of each agent iteration.
- `tool_call` / `tool_result`: Emitted for read-only tools (get_events, get_freebusy). These execute immediately.
- `delta`: Streamed text tokens from Claude's reply. Arrives as each token is generated via Anthropic's `client.messages.stream()` API.
- `event_proposal`: Emitted when Claude calls a write tool (create_event, update_event, delete_event). The agent loop **pauses** — the tool is NOT executed. The user must Accept or Decline via the EventCard UI.
- `done`: Stream complete. Frontend re-enables input.
- `error`: Unrecoverable error. Frontend shows error message and re-enables input.

## Server Architecture

### ClaudeService Changes

`runAgentLoop` becomes `streamAgentLoop`:

```ts
type SSEEmitter = (event: string, data: unknown) => void;

async streamAgentLoop(
  inputMessages: MessageParam[],
  calendarService: GoogleCalendarService,
  ctx: UserContext,
  emit: SSEEmitter,
): Promise<void>
```

Loop flow per iteration:
1. `emit('status', { type: 'thinking' })`
2. Call `client.messages.stream()` instead of `client.messages.create()`
3. As `content_block_delta` events arrive with `text_delta`, emit `delta` immediately
4. As `content_block_start` events arrive with `tool_use`, emit `tool_call`
5. After stream completes, get `stream.finalMessage()` for complete tool_use blocks
6. For each tool_use block:
   - **Read tool** (get_events, get_freebusy): dispatch immediately, emit `tool_result`, feed result back, continue loop
   - **Write tool** (create/update/delete): emit `event_proposal` with parsed CalendarEvent data, emit `done`, **stop loop**
7. If `stop_reason === 'end_turn'` with no tool calls, emit `done`

### Chat Route Changes

Set SSE headers on the response:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

Pass `res.write` as the emitter. Handle `res.on('close')` to abort the Anthropic stream on client disconnect.

### Accept/Decline Flow

When the user clicks Accept or Decline on an EventCard, the frontend sends a new chat request with a confirmation message (e.g., "Yes, create it" or "No, don't create it") appended to the conversation history. Claude sees the confirmation and either executes the write tool or acknowledges the decline. The agent remains the single source of truth for all calendar mutations.

## Frontend Architecture

### Stream Consumer

A standalone `streamChat()` function uses `fetch` directly (not `ApiClient`) to consume the SSE stream:

```ts
async function streamChat(
  messages: {role: string, content: string}[],
  timezone: string,
  token: string,
  onEvent: (event: SSEEvent) => void,
): Promise<void>
```

`authenticatedApi` remains for JSON endpoints. Only the chat endpoint uses streaming.

### Message State Model

The message list becomes a mixed `ChatItem` array:

```ts
type ChatItem =
  | { type: 'message'; id: string; role: 'user' | 'assistant'; content: string }
  | { type: 'event_proposal'; id: string; action: 'create' | 'update' | 'delete';
      event: CalendarEvent; status: 'pending' | 'accepted' | 'declined' }
```

- On `delta`: append text to the last assistant message (created empty when the stream starts)
- On `event_proposal`: append a new proposal item to the list
- On accept/decline: update the proposal's status, inject a user message, start a new stream

When sending history to the server, only `message` items are included — proposals are stripped.

### EventCard Component

Three visual variants by action:
- **Create**: green accent, "New Event" header
- **Update**: blue accent, "Update Event" header
- **Delete**: red accent, full event details, "Confirm Delete" / "Cancel" buttons

Shows: title, date/time, attendees (if present), location (if present).

After user action, buttons are replaced by a status badge: "Created" (green), "Declined" (gray), "Deleted" (red).

## Error Handling

1. **Stream connection fails**: frontend detects missing `done` event, shows "Connection lost", keeps partial text visible, re-enables input
2. **Tool dispatch fails**: server emits `tool_result` with error flag, Claude handles gracefully in its text response
3. **Client disconnects mid-stream**: Express detects via `res.on('close')`, aborts Anthropic stream
4. **Accept fails** (Google API error): agent sees the error, responds with explanation, EventCard shows error state

## Testing Strategy

**Server — ClaudeService:**
- Mock Anthropic `stream()` to yield controlled events
- Mock emit captures SSE events
- Cases: text streaming, read tool dispatch + loop, write tool proposal + stop, error handling, connection abort

**Server — chat route:**
- Supertest consumes SSE as string, parse and assert event order

**Frontend — ChatPage:**
- Mock `fetch` returning `ReadableStream` with controlled SSE chunks
- Cases: delta builds message, tool_call shows status, event_proposal renders EventCard, accept/decline flow, incomplete stream error

**Frontend — EventCard:**
- Stateless render tests per variant (create/update/delete)
- Accept/decline callback tests
- Post-action badge rendering

## Key Decisions

- **Accept/Decline through agent loop** (not direct API calls) — keeps Claude as single source of truth for all calendar mutations
- **Proposal card shows final state only** (no diff) — agent text provides change context
- **Delete card shows full event details** — reduces mistakes on destructive actions
- **Token-by-token streaming** — expected UX, Anthropic SDK supports natively, minimal added complexity
- **Standalone `streamChat()` function** — SSE doesn't fit the `ApiClient` JSON pattern, clean separation
