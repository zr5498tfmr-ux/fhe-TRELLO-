#!/usr/bin/env bash
# ============================================================================
#  FHE Project Board — Go Live with Cloudflare Tunnel
#
#  Usage:
#    bash deploy/office-laptop/go-live.sh
#
#  Two modes:
#    1. Quick Tunnel  — instant random URL (*.trycloudflare.com), no domain needed
#    2. Named Tunnel  — permanent URL on your domain (fhengineers.com)
#                       requires domain added to Cloudflare first
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

# ── Choose tunnel mode ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Choose your access mode:${NC}"
echo ""
echo "  1) Quick Tunnel  — Live in 30 seconds."
echo "                     Get a random HTTPS URL (*.trycloudflare.com)."
echo "                     No domain or Cloudflare config needed."
echo "                     URL changes each time you restart."
echo ""
echo "  2) Named Tunnel  — Permanent URL on fhengineers.com."
echo "                     Requires fhengineers.com added to Cloudflare"
echo "                     and a tunnel token from the dashboard."
echo ""
read -rp "Enter 1 or 2: " TUNNEL_MODE

case "$TUNNEL_MODE" in
  1) TUNNEL_MODE="quick" ;;
  2) TUNNEL_MODE="named" ;;
  *) fail "Invalid choice. Run the script again and enter 1 or 2." ;;
esac

# ── Ensure .env exists with base config ──────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  info "No .env found — generating base config..."
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  JWT_SECRET="$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)"
  cat > "$ENV_FILE" <<EOF
# ── FHE Project Board — Production Config ──
# Generated on $(date -Iseconds)

DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
CLIENT_URL=http://localhost:8080
EOF
  chmod 600 "$ENV_FILE"
  ok "Generated .env with secure passwords"
fi

# ── Named tunnel: collect token and URL ──────────────────────────────
if [ "$TUNNEL_MODE" = "named" ]; then
  source "$ENV_FILE" 2>/dev/null || true

  if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] || [ "$CLOUDFLARE_TUNNEL_TOKEN" = "your-token-here" ]; then
    echo ""
    echo -e "${BOLD}Cloudflare Tunnel Token needed.${NC}"
    echo ""
    echo "  1. Go to https://one.dash.cloudflare.com"
    echo "  2. Networks → Tunnels → click FHE-Project-Board → Edit → Configure"
    echo "  3. Copy the token (long string starting with eyJ...)"
    echo ""
    read -rp "Paste your tunnel token: " TUNNEL_TOKEN
    [ -z "$TUNNEL_TOKEN" ] && fail "No token provided."

    if grep -q "^CLOUDFLARE_TUNNEL_TOKEN=" "$ENV_FILE" 2>/dev/null; then
      sed -i "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$TUNNEL_TOKEN|" "$ENV_FILE"
    else
      printf "\nCLOUDFLARE_TUNNEL_TOKEN=%s\n" "$TUNNEL_TOKEN" >> "$ENV_FILE"
    fi
    ok "Tunnel token saved"
  else
    ok "Tunnel token found in .env"
  fi

  source "$ENV_FILE" 2>/dev/null || true
  CURRENT_URL="${CLIENT_URL:-http://localhost:8080}"
  if [[ "$CURRENT_URL" == *"localhost"* ]]; then
    echo ""
    echo -e "${BOLD}What's your public URL?${NC}"
    echo "  Example: https://board.fhengineers.com"
    echo ""
    read -rp "Public URL (Enter to skip): " PUBLIC_URL
    if [ -n "$PUBLIC_URL" ]; then
      [[ "$PUBLIC_URL" =~ ^https?:// ]] || PUBLIC_URL="https://$PUBLIC_URL"
      sed -i "s|^CLIENT_URL=.*|CLIENT_URL=$PUBLIC_URL|" "$ENV_FILE"
      ok "CLIENT_URL set to $PUBLIC_URL"
    fi
  fi
fi

# ── Create backup directory ──────────────────────────────────────────
mkdir -p "$DEPLOY_DIR/backups"

# ── Build & start app ────────────────────────────────────────────────
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

# Migrations
info "Running database migrations..."
docker compose -f "$COMPOSE_FILE" exec -T app node dist/db/migrate.js 2>/dev/null \
  && ok "Migrations complete" \
  || warn "Migrations may already be applied (OK on re-runs)"

# Seed
info "Seeding default data..."
docker compose -f "$COMPOSE_FILE" exec -T app node dist/db/seed.js 2>/dev/null \
  && ok "Seed data ready" \
  || warn "Seed data may already exist (OK on re-runs)"

# ── Start tunnel ─────────────────────────────────────────────────────
if [ "$TUNNEL_MODE" = "quick" ]; then
  info "Starting Cloudflare Quick Tunnel..."
  docker compose -f "$COMPOSE_FILE" --profile quick-tunnel up -d tunnel-quick
  sleep 4
  echo ""
  echo "============================================="
  echo -e "  ${GREEN}${BOLD}FHE Project Board is LIVE!${NC}"
  echo "============================================="
  echo ""
  echo "  Local:    http://localhost:8080"
  echo ""
  echo "  Public URL (check logs below):"
  docker compose -f "$COMPOSE_FILE" logs tunnel-quick 2>&1 \
    | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' \
    | tail -1 \
    | xargs -I{} echo "  Public:   {}" \
    || echo "  Run this to get your URL:"
  echo "  docker compose -f $COMPOSE_FILE logs tunnel-quick | grep trycloudflare"
  echo ""
  echo -e "  ${YELLOW}Note: This URL is temporary and changes on restart."
  echo -e "  Add fhengineers.com to Cloudflare for a permanent URL.${NC}"
else
  info "Starting Cloudflare Named Tunnel..."
  docker compose -f "$COMPOSE_FILE" --profile tunnel up -d tunnel
  sleep 3
  echo ""
  echo "============================================="
  echo -e "  ${GREEN}${BOLD}FHE Project Board is LIVE!${NC}"
  echo "============================================="
  echo ""
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")"
  echo "  Local:    http://localhost:8080"
  echo "  LAN:      http://${LAN_IP}:8080"
  source "$ENV_FILE" 2>/dev/null || true
  [[ "${CLIENT_URL:-}" == https://* ]] && echo "  Public:   ${CLIENT_URL}"
fi

echo ""
echo "  Default login:"
echo "    Email:    admin@floridahorizoneng.com"
echo "    Password: admin123"
echo -e "    ${RED}(Change this after first login!)${NC}"
echo ""
echo "  ── Commands ──"
echo "  Logs:    docker compose -f $COMPOSE_FILE logs -f"
echo "  Stop:    docker compose -f $COMPOSE_FILE --profile tunnel --profile quick-tunnel down"
echo ""
