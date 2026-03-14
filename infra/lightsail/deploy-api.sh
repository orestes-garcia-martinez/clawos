#!/usr/bin/env bash
# deploy-api.sh — ClawOS Lightsail Agent API deployment
#
# Run from your local machine (repo root):
#   CLAWOS_ANTHROPIC_KEY=... WORKER_SECRET=... SERVICE_SECRET=... \
#   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \
#   bash infra/lightsail/deploy-api.sh
#
# Prerequisites (already completed):
#   - clawos-admin user exists with SSH access
#   - Node.js 22 installed system-wide
#   - Skill worker already deployed and running (Chat 3)
#
# What this script does:
#   1. Syncs repo code to the server
#   2. Installs dependencies (npm ci -- frozen)
#   3. Builds TypeScript (packages first, then apps/api)
#   4. Writes .env file from shell env vars (never stored in repo)
#   5. Installs and enables systemd service (requires ubuntu user for sudo)
#   6. Smoke-tests the /health endpoint

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

LIGHTSAIL_HOST="100.103.12.74"
LIGHTSAIL_SUDO_USER="ubuntu"
DEPLOY_USER="clawos-admin"
DEPLOY_DIR="/home/${DEPLOY_USER}/clawos"
API_PORT="${API_PORT:-3001}"
SSH_KEY="${USERPROFILE:-$HOME}/.ssh/LightsailDefaultKey-us-east-1.pem"
SSH_OPTS="-i \"${SSH_KEY}\" -o StrictHostKeyChecking=no"

# Validate required secrets before touching the server
: "${CLAWOS_ANTHROPIC_KEY:?CLAWOS_ANTHROPIC_KEY is required}"
: "${WORKER_SECRET:?WORKER_SECRET is required}"
: "${SERVICE_SECRET:?SERVICE_SECRET is required}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

# Optional
CLAWOS_OPENAI_KEY="${CLAWOS_OPENAI_KEY:-}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-http://localhost:5173}"

log() { echo "[deploy-api] $*"; }
die() { echo "[deploy-api] ERROR: $*" >&2; exit 1; }

ssh_deploy() { eval "ssh ${SSH_OPTS} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" "$@"; }
ssh_sudo()   { eval "ssh ${SSH_OPTS} ${LIGHTSAIL_SUDO_USER}@${LIGHTSAIL_HOST}" "$@"; }

# ── Step 1: Sync repo code ────────────────────────────────────────────────────

log "Step 1/6 — Syncing code to server..."

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ssh_deploy "mkdir -p ${DEPLOY_DIR}"

rsync -az --delete \
  -e "ssh ${SSH_OPTS}" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.turbo' \
  --exclude='*.tsbuildinfo' \
  --exclude='.env' \
  --exclude='.env.test' \
  "${REPO_ROOT}/" \
  "${DEPLOY_USER}@${LIGHTSAIL_HOST}:${DEPLOY_DIR}/"

log "  Code synced to ${DEPLOY_DIR}"

# ── Steps 2–3: npm ci + build ─────────────────────────────────────────────────

log "Step 2/6 — npm ci (frozen install)..."
log "Step 3/6 — Building TypeScript..."

ssh_deploy << REMOTE
set -euo pipefail
cd "${DEPLOY_DIR}"

echo "  Running npm ci..."
npm ci --ignore-scripts
echo "  npm ci complete"

echo "  Building packages in dependency order..."
npx tsc -p packages/shared/tsconfig.json
npx tsc -p packages/security/tsconfig.json
npx tsc -p packages/billing/tsconfig.json
echo "  Packages built"

echo "  Building apps/api..."
npx tsc -p apps/api/tsconfig.json
echo "  Build complete"
REMOTE

# ── Step 4: Write .env ────────────────────────────────────────────────────────

log "Step 4/6 — Writing .env..."

ssh_deploy << REMOTE
set -euo pipefail
cat > "${DEPLOY_DIR}/apps/api/.env" << EOF
PORT=${API_PORT}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
CLAWOS_ANTHROPIC_KEY=${CLAWOS_ANTHROPIC_KEY}
CLAWOS_OPENAI_KEY=${CLAWOS_OPENAI_KEY}
WORKER_URL=http://localhost:3002
WORKER_SECRET=${WORKER_SECRET}
ALLOWED_ORIGIN=${ALLOWED_ORIGIN}
SERVICE_SECRET=${SERVICE_SECRET}
EOF
chmod 600 "${DEPLOY_DIR}/apps/api/.env"
echo "  .env written (mode 600)"
REMOTE

# ── Step 5: Install systemd service ──────────────────────────────────────────

log "Step 5/6 — Installing systemd service..."

ssh_sudo << REMOTE
set -euo pipefail
sudo cp "${DEPLOY_DIR}/infra/lightsail/clawos-api.service" /etc/systemd/system/clawos-api.service
sudo systemctl daemon-reload
sudo systemctl enable clawos-api
sudo systemctl restart clawos-api
echo "  Service enabled and started"
sudo systemctl status clawos-api --no-pager | head -20
REMOTE

# ── Step 6: Smoke test ────────────────────────────────────────────────────────

log "Step 6/6 — Smoke testing /health..."
sleep 3

HEALTH=$(ssh_deploy "curl -sf http://localhost:${API_PORT}/health || echo FAILED")

if echo "${HEALTH}" | grep -q '"status":"ok"'; then
  log "  /health OK: ${HEALTH}"
else
  die "/health failed: ${HEALTH}
  Check logs: journalctl -u clawos-api -n 50"
fi

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Agent API deployment complete."
log "  API     : http://${LIGHTSAIL_HOST}:${API_PORT}"
log "  Health  : http://${LIGHTSAIL_HOST}:${API_PORT}/health"
log "  Logs    : journalctl -u clawos-api -f"
log "  Status  : systemctl status clawos-api"
log ""
log "Next: re-deploy Telegram adapter with updated AGENT_API_URL:"
log "  bash infra/lightsail/deploy-telegram.sh"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
