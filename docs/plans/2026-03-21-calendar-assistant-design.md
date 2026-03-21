# Calendar Assistant — Design Doc
_2026-03-21_

## Overview

A React web app backed by a Node/Express server. Users authenticate with Google, view their calendar, and chat with an AI agent that understands their schedule and a persistent personal skills/persona doc.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Styling | Tailwind CSS |
| Routing | react-router-dom |
| Auth (client) | @react-oauth/google |
| Calendar UI | react-big-calendar |
| State | Zustand |
| HTTP client | axios |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite (better-sqlite3) |
| AI | Anthropic Claude API (tool use) |
| Calendar API | Google Calendar API (googleapis) |
| Auth (server) | JWT (jsonwebtoken) |

---

## App Flows

### Unauthenticated
- User lands on `/` and sees a "Sign in with Google" button
- Google OAuth browser redirect via `@react-oauth/google`
- Auth code sent to `POST /auth/google` on server
- Server exchanges for Google access + refresh tokens, upserts user, returns JWT
- JWT stored in `localStorage`, user redirected to `/calendar`

### Authenticated — Three routes
- `/calendar` — Calendar view
- `/chat` — Chat with agent
- `/skills` — View and edit personal skills doc

### Navigation
Persistent top nav with links to all three routes. Unauthenticated users are redirected to `/`.

---

## Screens

### Calendar (`/calendar`)
- `react-big-calendar` agenda or week view
- Events fetched from `GET /calendar/events?start=&end=`
- Google event shape transformed to react-big-calendar format
- Each event shows title, time, duration, attendees

### Chat (`/chat`)
- Scrollable message list (user/assistant bubbles)
- Text input + send button at bottom
- Today summary card at top (meeting count + total hours)
- Message history kept in React state, sent with each request for agent context
- No server-side message persistence (add later if needed)

### Skills (`/skills`)
- Displays user's persona doc in an editable text area
- Save button calls `PUT /skills`
- Persona doc is also editable via chat (agent detects preference statements and updates it)

---

## Backend Routes

| Method | Route | Description |
|---|---|---|
| POST | `/auth/google` | Exchange Google auth code, return JWT |
| GET | `/calendar/events` | Fetch and normalize user's calendar events |
| GET | `/skills` | Return user's persona doc |
| PUT | `/skills` | Update user's persona doc |
| POST | `/chat` | Run agentic loop, return response |

All routes except `/auth/google` require JWT (`Authorization: Bearer <token>`).

---

## Database (SQLite)

```
users   — id, google_id, email, access_token, refresh_token
skills  — user_id, content (markdown text), updated_at
```

No messages table. Chat history is owned by the client for the duration of a session.

---

## Agent Design (Tool Use)

Every `POST /chat` call:
1. Loads user's persona doc from DB
2. Injects persona as system prompt prefix
3. Passes full message history + tool definitions to Claude
4. Runs tool-call loop until Claude returns a final text response
5. Returns response to client

### Tools

| Tool | Type | Description |
|---|---|---|
| `get_events(start, end)` | read | Fetch events in a date range |
| `get_free_slots(start, end)` | read | Return open time blocks |
| `create_event(...)` | write | Create a calendar event |
| `get_attendee_availability(...)` | read | Check others' free/busy |
| `update_skills(content)` | write | Patch user's persona doc |

Calendar writes are only made when the user explicitly confirms. The agent suggests; the user approves.

---

## Skills / Persona System

- One freeform markdown doc per user stored in DB
- Prepended to every Claude system prompt: _"Here's what I know about this user: ..."_
- Editable directly on `/skills` screen
- Agent passively captures preferences mid-conversation via `update_skills` tool
  - e.g. "I don't want meetings before 9" → agent calls `update_skills`, confirms in chat

---

## File Structure

```
calendar-assistant/
├── app/                          # React + Vite frontend
│   ├── src/
│   │   ├── screens/
│   │   │   ├── CalendarScreen.tsx
│   │   │   ├── ChatScreen.tsx
│   │   │   └── SkillsScreen.tsx
│   │   ├── components/
│   │   │   ├── EventCard.tsx
│   │   │   ├── ChatBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── TodaySummaryCard.tsx
│   │   │   └── NavBar.tsx
│   │   ├── router/
│   │   │   └── index.tsx
│   │   ├── hooks/
│   │   │   ├── useCalendar.ts
│   │   │   └── useChat.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── store/
│   │   │   └── authStore.ts
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
└── server/                       # Node/Express backend
    ├── src/
    │   ├── routes/
    │   │   ├── auth.ts
    │   │   ├── calendar.ts
    │   │   ├── chat.ts
    │   │   └── skills.ts
    │   ├── services/
    │   │   ├── googleCalendar.ts
    │   │   ├── claude.ts
    │   │   ├── tools.ts
    │   │   ├── toolHandlers.ts
    │   │   └── skills.ts
    │   ├── db/
    │   │   ├── client.ts
    │   │   └── migrations/
    │   ├── middleware/
    │   │   └── auth.ts
    │   └── index.ts
    └── package.json
```

---

## Task Breakdown

### Epic 1 — Foundations
1. **Monorepo scaffold** — `app/` + `server/` structure, TypeScript configs, root scripts
2. **Server bootstrap + DB** — Express server, SQLite client, migration runner, users + skills tables

### Epic 2 — Auth
3. **Server auth route** — Google token exchange, user upsert, JWT signing, auth middleware
4. **App auth state + routing** — Zustand store, localStorage JWT, axios base instance, route guards
5. **App auth screen** — Sign in UI, `@react-oauth/google` trigger, calls server auth route

### Epic 3 — Calendar
6. **Google Calendar service** — `googleCalendar.ts`, `getEvents`, `getFreeSlots`, token refresh
7. **Server calendar route** — `GET /calendar/events`, normalize Google event shape
8. **App calendar screen** — `useCalendar` hook, event transform, `react-big-calendar` agenda view

### Epic 4 — Skills
9. **Server skills routes** — `GET /skills`, `PUT /skills`, skills service
10. **App skills screen** — `SkillsScreen`, fetch/edit/save persona doc

### Epic 5 — Chat Agent
11. **Claude tool schemas + read handlers** — tool JSON schemas, `get_events` + `get_free_slots` handlers
12. **Claude write tool handlers** — `create_event` + `get_attendee_availability` handlers
13. **Agentic loop** — `claude.ts`, system prompt with persona, tool-call loop
14. **Server chat route** — `POST /chat`, load persona, pass history, return response
15. **App chat components** — `ChatBubble`, `ChatInput` (stateless)
16. **App chat screen** — `ChatScreen`, message state, wired to `/chat`

### Epic 6 — Persona via Chat
17. **Skill capture tool** — `update_skills` tool handler, system prompt instruction, DB patch
18. **Today summary card** — `TodaySummaryCard`, fetch today's events, show on chat screen
