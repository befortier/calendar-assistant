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

# ── Preflight ───────────────────────────────────
echo ""
echo -e "${BOLD}Calendar Assistant Setup${NC}"
echo "────────────────────────────────────────"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node 22+ from https://nodejs.org"
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  fail "Node.js 22+ required (found v$(node --version | sed 's/v//')). Update from https://nodejs.org"
fi
ok "Node.js $(node --version)"

# ── Install dependencies ────────────────────────
info "Installing dependencies..."
npm install --silent 2>&1 | tail -1
ok "Dependencies installed"

# ── Collect environment variables ────────────────
echo ""
echo -e "${BOLD}Environment Variables${NC}"
echo "────────────────────────────────────────"
echo "You'll need your Google OAuth credentials and Anthropic API key."
echo ""

prompt_var() {
  local var_name="$1"
  local description="$2"
  local default="${3:-}"
  local is_secret="${4:-false}"
  local value=""

  if [ -n "$default" ]; then
    echo -ne "${CYAN}${var_name}${NC} (${description}) [${default}]: "
    if [ "$is_secret" = "true" ]; then read -rs value; echo ""; else read -r value; fi
    value="${value:-$default}"
  else
    while [ -z "$value" ]; do
      echo -ne "${CYAN}${var_name}${NC} (${description}): "
      if [ "$is_secret" = "true" ]; then read -rs value; echo ""; else read -r value; fi
      if [ -z "$value" ]; then
        warn "Required — cannot be empty"
      fi
    done
  fi
  echo "$value"
}

GOOGLE_CLIENT_ID=$(prompt_var "GOOGLE_CLIENT_ID" "Google OAuth client ID" "" false)
GOOGLE_CLIENT_SECRET=$(prompt_var "GOOGLE_CLIENT_SECRET" "Google OAuth client secret" "" true)
ANTHROPIC_API_KEY=$(prompt_var "ANTHROPIC_API_KEY" "Anthropic API key" "" true)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
TOKEN_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

echo ""
ok "Generated JWT_SECRET and TOKEN_ENCRYPTION_KEY automatically"

# ── Write server/.env ────────────────────────────
cat > server/.env <<EOF
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
JWT_SECRET=${JWT_SECRET}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY}
PORT=3001
ALLOWED_ORIGIN=http://localhost:5173
EOF
ok "Wrote server/.env"

# ── Write app/.env.local ─────────────────────────
cat > app/.env.local <<EOF
VITE_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
EOF
ok "Wrote app/.env.local"

# ── Done ─────────────────────────────────────────
echo ""
echo "────────────────────────────────────────"
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo -e "  ${BOLD}Start the app:${NC}     npm run dev"
echo -e "  ${BOLD}Run all tests:${NC}     npm test --workspace=app && npm run test:unit --workspace=server"
echo -e "  ${BOLD}Open in browser:${NC}   http://localhost:5173"
echo ""
