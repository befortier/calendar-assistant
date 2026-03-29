#!/usr/bin/env bash
# dev.sh — kill any running dev servers and restart both BE and FE
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

# --- Kill anything on the dev ports ---
echo "Stopping existing servers..."
for PORT in 3001 5173; do
  PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "  Stopping PID(s) $PIDS on port $PORT"
    kill "$PIDS" 2>/dev/null || true
    sleep 1
    kill -9 "$PIDS" 2>/dev/null || true
  fi
done
sleep 0.5

# --- Start server ---
echo "Starting server..."
cd "$ROOT"
npm run dev:server > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "  Server PID: $SERVER_PID (logs: $LOG_DIR/server.log)"

# --- Start app ---
echo "Starting app..."
npm run dev:app > "$LOG_DIR/app.log" 2>&1 &
APP_PID=$!
echo "  App PID: $APP_PID (logs: $LOG_DIR/app.log)"

# --- Wait for server to be ready ---
echo "Waiting for server on port 3001..."
for _ in $(seq 1 30); do
  if lsof -ti tcp:3001 > /dev/null 2>&1; then
    echo "  Server ready."
    break
  fi
  sleep 0.5
done

echo ""
echo "Dev stack running:"
echo "  App:    http://localhost:5173"
echo "  Server: http://localhost:3001"
echo ""
echo "Logs:"
echo "  tail -f $LOG_DIR/server.log"
echo "  tail -f $LOG_DIR/app.log"
