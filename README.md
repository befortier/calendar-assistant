# Calendar Assistant

An AI-powered Google Calendar assistant. Chat in natural language to view, create, update, and delete events. The assistant proposes changes as interactive cards you can review before they're applied.

## Architecture

```
app/          React SPA (Vite + TypeScript + Tailwind)
server/       Express API (TypeScript + Claude AI + Google Calendar API)
```

- **Frontend** -- React 18, React Router, Zustand for state, Tailwind CSS for styling
- **Backend** -- Express with SSE streaming, Anthropic Claude for AI, Google Calendar API for calendar operations
- **Database** -- SQLite (better-sqlite3) for user sessions and preferences
- **Auth** -- Google OAuth 2.0, JWT sessions

## Prerequisites

- **Node.js 22+** (check with `node --version`)
- **npm 10+** (ships with Node 22)
- **Google Cloud project** with OAuth 2.0 credentials and Calendar API enabled
- **Anthropic API key** from [console.anthropic.com](https://console.anthropic.com)

## Setup

### 1. Clone and install

```bash
git clone git@github.com:befortier/calendar-assistant.git
cd calendar-assistant
npm install
```

### 2. Configure environment variables

Copy the example and fill in your keys:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) -- create an OAuth 2.0 client (Web application) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Same credential as above |
| `JWT_SECRET` | Secret for signing session tokens | Any random string (e.g. `openssl rand -hex 32`) |
| `ANTHROPIC_API_KEY` | Claude API key | [console.anthropic.com](https://console.anthropic.com) |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex key for encrypting stored tokens | Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Optional (defaults shown):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | CORS origin for the frontend |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Claude model to use |

The frontend needs one variable. Create `app/.env.local`:

```bash
VITE_GOOGLE_CLIENT_ID=<same Google client ID as server>
```

Optionally, if your server runs on a non-default port:

```bash
VITE_API_URL=http://localhost:3001
```

### 3. Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable the **Google Calendar API**
4. Go to **Credentials** > **Create Credentials** > **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add `http://localhost:5173` to **Authorized JavaScript origins**
7. Add `http://localhost:5173` to **Authorized redirect URIs**
8. Copy the Client ID and Client Secret to your `server/.env`

### 4. Run

```bash
npm run dev
```

This starts both services concurrently:
- **Frontend**: http://localhost:5173
- **Server**: http://localhost:3001

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both app and server in dev mode |
| `npm run dev:app` | Start only the frontend (Vite) |
| `npm run dev:server` | Start only the backend (nodemon) |
| `npm test --workspace=app` | Run frontend tests |
| `npm run test:unit --workspace=server` | Run server unit tests |
| `npm run test:integration --workspace=server` | Run server integration tests |
| `npm run lint` | Lint both workspaces |
| `npm run build --workspace=app` | Production build (frontend) |
| `npm run build --workspace=server` | Production build (server) |

## Deployment

The project deploys to [Railway](https://railway.app) as two services:

- **app** -- static SPA served by Caddy
- **server** -- Node.js Express server

Both auto-deploy from `main` on push. The server service watches `server/**` and the app service watches `app/**`.
