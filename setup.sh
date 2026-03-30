#!/usr/bin/env bash
set -euo pipefail

# ── Colors ──────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC}  $1"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $1"; }
fail()  { echo -e "${RED}[error]${NC} $1"; exit 1; }

echo ""
echo -e "${BOLD}Calendar Assistant Setup${NC}"
echo "────────────────────────────────────────"
echo ""

# ── Preflight ───────────────────────────────────
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node 22+ from https://nodejs.org"
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  fail "Node.js 22+ required (found v$(node --version | sed 's/v//')). Update from https://nodejs.org"
fi
ok "Node.js $(node --version)"

# ── Validate env files ──────────────────────────
if [ ! -f server/.env ]; then
  fail "server/.env not found. Copy server/.env.example and fill in your keys."
fi
ok "server/.env exists"

if [ ! -f app/.env.local ]; then
  fail "app/.env.local not found. Create it with VITE_GOOGLE_CLIENT_ID=<your client id>"
fi
ok "app/.env.local exists"

# Check required server vars are non-empty
REQUIRED_VARS=(GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET JWT_SECRET ANTHROPIC_API_KEY TOKEN_ENCRYPTION_KEY)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  val=$(grep "^${var}=" server/.env 2>/dev/null | cut -d= -f2-)
  if [ -z "$val" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  fail "Missing values in server/.env: ${MISSING[*]}"
fi
ok "All required server env vars set"

# Check app env
APP_CLIENT_ID=$(grep "^VITE_GOOGLE_CLIENT_ID=" app/.env.local 2>/dev/null | cut -d= -f2-)
if [ -z "$APP_CLIENT_ID" ]; then
  fail "VITE_GOOGLE_CLIENT_ID is empty in app/.env.local"
fi
ok "App env configured"

# ── Install dependencies ────────────────────────
info "Installing dependencies..."
npm install --silent 2>&1 | tail -1
ok "Dependencies installed"

# ── Done ─────────────────────────────────────────
echo ""
echo "────────────────────────────────────────"
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo -e "  ${BOLD}Start the app:${NC}     npm run dev"
echo -e "  ${BOLD}Run all tests:${NC}     npm test --workspace=app && npm run test:unit --workspace=server"
echo -e "  ${BOLD}Open in browser:${NC}   http://localhost:5173"
echo ""
