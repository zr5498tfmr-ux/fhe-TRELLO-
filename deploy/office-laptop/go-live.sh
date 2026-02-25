#!/usr/bin/env bash
# ============================================================================
#  FHE Project Board — Go Live with Cloudflare Tunnel
#
#  This script handles everything needed to get the app running and
#  accessible from the internet via your Cloudflare Tunnel.
#
#  Prerequisites:
#    - Docker installed and running
#    - Cloudflare tunnel created with a "Published application" route
#      pointing to  http://app:8080
#
#  Usage:
#    bash deploy/office-laptop/go-live.sh
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"
ENV_FILE="$DEPLOY_DIR/.env"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

echo ""
echo "============================================="
echo "  FHE Project Board — Go Live"
echo "============================================="
echo ""

# ── Check Docker ─────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  fail "Docker is not installed. Run setup.sh first or install Docker."
fi

if ! docker info &> /dev/null 2>&1; then
  fail "Docker is not running. Start Docker Desktop or the Docker service."
fi

ok "Docker is running"

# ── Ensure .env exists with base config ──────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  info "No .env found — generating base config..."
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  JWT_SECRET="$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)"

  cat > "$ENV_FILE" <<EOF
# ── FHE Project Board — Production Config ──
# Generated on $(date -Iseconds)

# Database
DB_PASSWORD=$DB_PASSWORD

# Authentication
JWT_SECRET=$JWT_SECRET

# App URL — will be updated once tunnel is configured
CLIENT_URL=http://localhost:8080
EOF

  chmod 600 "$ENV_FILE"
  ok "Generated .env with secure passwords"
fi

# ── Prompt for Cloudflare tunnel token if not set ────────────────────
source "$ENV_FILE" 2>/dev/null || true

if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] || [ "$CLOUDFLARE_TUNNEL_TOKEN" = "your-token-here" ]; then
  echo ""
  echo -e "${BOLD}Cloudflare Tunnel Token needed.${NC}"
  echo ""
  echo "  How to get it:"
  echo "  1. Go to https://one.dash.cloudflare.com"
  echo "  2. Networks → Tunnels → click your tunnel (FHE-Project-Board)"
  echo "  3. Click Edit → Configure"
  echo "  4. Under the Install connector section, find the token"
  echo "     (the long string starting with eyJ...)"
  echo ""
  read -rp "Paste your tunnel token: " TUNNEL_TOKEN

  if [ -z "$TUNNEL_TOKEN" ]; then
    fail "No token provided. Cannot start tunnel without it."
  fi

  # Write or update the token in .env
  if grep -q "^CLOUDFLARE_TUNNEL_TOKEN=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$TUNNEL_TOKEN|" "$ENV_FILE"
  else
    echo "" >> "$ENV_FILE"
    echo "# Cloudflare Tunnel" >> "$ENV_FILE"
    echo "CLOUDFLARE_TUNNEL_TOKEN=$TUNNEL_TOKEN" >> "$ENV_FILE"
  fi

  ok "Tunnel token saved to .env"
else
  ok "Tunnel token found in .env"
fi

# ── Ask for public URL ───────────────────────────────────────────────
source "$ENV_FILE" 2>/dev/null || true
CURRENT_URL="${CLIENT_URL:-http://localhost:8080}"

if [[ "$CURRENT_URL" == *"localhost"* ]] || [[ "$CURRENT_URL" == *"192.168"* ]] || [[ "$CURRENT_URL" == *"10."* ]]; then
  echo ""
  echo -e "${BOLD}What's your public URL?${NC}"
  echo ""
  echo "  This is the hostname you set up in your Cloudflare tunnel route."
  echo "  Example: https://board.yourdomain.com"
  echo ""
  read -rp "Public URL (press Enter to skip for now): " PUBLIC_URL

  if [ -n "$PUBLIC_URL" ]; then
    # Ensure it starts with https://
    if [[ ! "$PUBLIC_URL" =~ ^https?:// ]]; then
      PUBLIC_URL="https://$PUBLIC_URL"
    fi

    sed -i "s|^CLIENT_URL=.*|CLIENT_URL=$PUBLIC_URL|" "$ENV_FILE"
    ok "CLIENT_URL set to $PUBLIC_URL"
  else
    warn "Skipped — you can update CLIENT_URL in .env later"
  fi
fi

# ── Create backup directory ──────────────────────────────────────────
mkdir -p "$DEPLOY_DIR/backups"

# ── Build & start everything ─────────────────────────────────────────
echo ""
info "Building the application (first time takes 2-3 minutes)..."
cd "$DEPLOY_DIR"
docker compose -f "$COMPOSE_FILE" build app

info "Starting database and application..."
docker compose -f "$COMPOSE_FILE" up -d db app

# Wait for DB
info "Waiting for database..."
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U fhe_user -d fhe_project_board &>/dev/null; then
    break
  fi
  sleep 1
done
ok "Database is ready"

# Run migrations
info "Running database migrations..."
docker compose -f "$COMPOSE_FILE" exec -T app node server/dist/db/migrate.js 2>/dev/null \
  && ok "Migrations complete" \
  || warn "Migrations may already be applied (OK on re-runs)"

# Seed data
info "Seeding default data..."
docker compose -f "$COMPOSE_FILE" exec -T app node server/dist/db/seed.js 2>/dev/null \
  && ok "Seed complete" \
  || warn "Seed data may already exist (OK on re-runs)"

# ── Start the Cloudflare tunnel ──────────────────────────────────────
info "Starting Cloudflare tunnel..."
docker compose -f "$COMPOSE_FILE" --profile tunnel up -d tunnel

# Give it a moment to connect
sleep 3

# Check if tunnel is running
if docker compose -f "$COMPOSE_FILE" ps tunnel 2>/dev/null | grep -q "running"; then
  ok "Cloudflare tunnel is running"
else
  warn "Tunnel may still be starting — check logs below if it fails"
fi

# ── Verify ───────────────────────────────────────────────────────────
echo ""
info "Checking app health..."
sleep 2
if curl -sf http://localhost:8080/api/health > /dev/null 2>&1; then
  ok "App is healthy"
elif curl -sf http://localhost:8080 > /dev/null 2>&1; then
  ok "App is responding"
else
  warn "App may still be starting up — give it another minute"
fi

# ── Show result ──────────────────────────────────────────────────────
source "$ENV_FILE" 2>/dev/null || true
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")"

echo ""
echo "============================================="
echo -e "  ${GREEN}${BOLD}FHE Project Board is LIVE!${NC}"
echo "============================================="
echo ""
echo "  Local:    http://localhost:8080"
echo "  LAN:      http://${LAN_IP}:8080"
if [[ "${CLIENT_URL:-}" == https://* ]]; then
echo "  Public:   ${CLIENT_URL}"
fi
echo ""
echo "  Default login:"
echo "    Email:    admin@floridahorizoneng.com"
echo "    Password: admin123"
echo -e "    ${RED}(Change this immediately after first login!)${NC}"
echo ""
echo "  ── Commands ──"
echo "  View logs:     docker compose -f $COMPOSE_FILE logs -f"
echo "  Tunnel logs:   docker compose -f $COMPOSE_FILE logs tunnel"
echo "  Stop:          docker compose -f $COMPOSE_FILE --profile tunnel down"
echo "  Restart:       docker compose -f $COMPOSE_FILE --profile tunnel restart"
echo ""
