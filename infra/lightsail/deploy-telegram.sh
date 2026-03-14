#!/usr/bin/env bash
# deploy-telegram.sh — ClawOS Lightsail Telegram Adapter deployment
#
# Run from your local machine (repo root):
#   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
#   SERVICE_SECRET=... LINK_TOKEN_SECRET=... \
#   AGENT_API_URL=https://your-api.vercel.app \
#   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \
#   WEBHOOK_URL=https://your-lightsail-ip-or-domain:3003/webhook \
#   bash infra/lightsail/deploy-telegram.sh
#
# Prerequisites (already completed manually):
#   - clawos-admin user exists with SSH access
#   - Node.js 22 installed system-wide
#   - Skill worker already deployed (Chat 3)
#
# What this script does:
#   1. Syncs repo code to the server
#   2. Installs dependencies (npm ci -- frozen)
#   3. Builds TypeScript
#   4. Writes .env file from shell env vars (never stored in repo)
#   5. Installs and enables systemd service (requires ubuntu user for sudo)
#   6. Smoke-tests the /health endpoint
#   7. Registers the Telegram webhook (calls register-telegram-webhook.sh)

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

LIGHTSAIL_HOST="100.103.12.74"
LIGHTSAIL_SUDO_USER="ubuntu"
DEPLOY_USER="clawos-admin"
DEPLOY_DIR="/home/${DEPLOY_USER}/clawos"
TELEGRAM_PORT="${TELEGRAM_PORT:-3003}"
SSH_KEY="${USERPROFILE:-$HOME}/.ssh/LightsailDefaultKey-us-east-1.pem"
SSH_OPTS="-i \"${SSH_KEY}\" -o StrictHostKeyChecking=no"

# Validate required secrets before touching the server
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is required}"
: "${TELEGRAM_WEBHOOK_SECRET:?TELEGRAM_WEBHOOK_SECRET is required}"
: "${SERVICE_SECRET:?SERVICE_SECRET is required}"
: "${LINK_TOKEN_SECRET:?LINK_TOKEN_SECRET is required}"
: "${AGENT_API_URL:?AGENT_API_URL is required}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${WEBHOOK_URL:?WEBHOOK_URL is required (e.g. https://your-domain:3003/webhook)}"

log() { echo "[deploy-telegram] $*"; }
die() { echo "[deploy-telegram] ERROR: $*" >&2; exit 1; }

ssh_deploy() { eval "ssh ${SSH_OPTS} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" "$@"; }
ssh_sudo()   { eval "ssh ${SSH_OPTS} ${LIGHTSAIL_SUDO_USER}@${LIGHTSAIL_HOST}" "$@"; }

# ── Step 1: Sync repo code ────────────────────────────────────────────────────

log "Step 1/7 — Syncing code to server..."

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ssh_deploy "mkdir -p ${DEPLOY_DIR}"

rsync -az --delete \
  -e "ssh ${SSH_OPTS}" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.turbo' \
  --exclude='*.tsbuildinfo' \
  --exclude='.env' \
  "${REPO_ROOT}/" \
  "${DEPLOY_USER}@${LIGHTSAIL_HOST}:${DEPLOY_DIR}/"

log "  Code synced to ${DEPLOY_DIR}"

# ── Steps 2–3: npm ci + build ─────────────────────────────────────────────────

log "Step 2/7 — npm ci (frozen install)..."
log "Step 3/7 — Building TypeScript..."

ssh_deploy << REMOTE
set -euo pipefail
cd "${DEPLOY_DIR}"

echo "  Running npm ci..."
npm ci --workspace=apps/telegram --include-workspace-root
echo "  npm ci complete"

echo "  Building TypeScript..."
npm run build --workspace=apps/telegram
echo "  Build complete"
REMOTE

# ── Step 4: Write .env ────────────────────────────────────────────────────────

log "Step 4/7 — Writing .env..."

ssh_deploy << REMOTE
set -euo pipefail
cat > "${DEPLOY_DIR}/apps/telegram/.env" << EOF
PORT=${TELEGRAM_PORT}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_WEBHOOK_SECRET=${TELEGRAM_WEBHOOK_SECRET}
AGENT_API_URL=${AGENT_API_URL}
SERVICE_SECRET=${SERVICE_SECRET}
LINK_TOKEN_SECRET=${LINK_TOKEN_SECRET}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
EOF
chmod 600 "${DEPLOY_DIR}/apps/telegram/.env"
echo "  .env written (mode 600)"
REMOTE

# ── Step 5: Install systemd service ──────────────────────────────────────────

log "Step 5/7 — Installing systemd service..."

ssh_sudo << REMOTE
set -euo pipefail
sudo cp "${DEPLOY_DIR}/infra/lightsail/clawos-telegram.service" /etc/systemd/system/clawos-telegram.service
sudo systemctl daemon-reload
sudo systemctl enable clawos-telegram
sudo systemctl restart clawos-telegram
echo "  Service enabled and started"
sudo systemctl status clawos-telegram --no-pager | head -20
REMOTE

# ── Step 6: Smoke test ────────────────────────────────────────────────────────

log "Step 6/7 — Smoke testing /health..."
sleep 3

HEALTH=$(ssh_deploy "curl -sf http://localhost:${TELEGRAM_PORT}/health || echo FAILED")

if echo "${HEALTH}" | grep -q '"status":"ok"'; then
  log "  /health OK: ${HEALTH}"
else
  die "/health failed: ${HEALTH}
  Check logs: journalctl -u clawos-telegram -n 50"
fi

# ── Step 7: Register Telegram webhook ────────────────────────────────────────

log "Step 7/7 — Registering Telegram webhook..."

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}" \
TELEGRAM_WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET}" \
WEBHOOK_URL="${WEBHOOK_URL}" \
bash "$(dirname "${BASH_SOURCE[0]}")/register-telegram-webhook.sh"

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Telegram adapter deployment complete."
log "  Adapter : http://${LIGHTSAIL_HOST}:${TELEGRAM_PORT}"
log "  Webhook : ${WEBHOOK_URL}"
log "  Logs    : journalctl -u clawos-telegram -f"
log "  Status  : systemctl status clawos-telegram"
log "  Next    : Chat 6 — Web Frontend"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
