#!/usr/bin/env bash
# deploy-worker.sh — ClawOS Lightsail Skill Worker deployment
#
# Run from your local machine (repo root):
#   WORKER_SECRET=... CAREERCLAW_ANTHROPIC_KEY=... \
#   SKILL_ASSERTION_PUBLIC_KEYS_JSON='{"skill-assertion-current":"-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----"}' \
#   bash infra/lightsail/deploy-worker.sh

set -euo pipefail

LIGHTSAIL_HOST="100.103.12.74"
LIGHTSAIL_SUDO_USER="ubuntu"
DEPLOY_USER="clawos-admin"
DEPLOY_DIR="/home/${DEPLOY_USER}/clawos"
WORKSPACE_DIR="/home/${DEPLOY_USER}/careerclaw-workspace"
WORKER_PORT="${WORKER_PORT:-3002}"
SSH_KEY="${USERPROFILE:-$HOME}/.ssh/LightsailDefaultKey-us-east-1.pem"
SSH_OPTS="-i \"${SSH_KEY}\" -o StrictHostKeyChecking=no"

: "${WORKER_SECRET:?WORKER_SECRET is required}"
: "${CAREERCLAW_ANTHROPIC_KEY:?CAREERCLAW_ANTHROPIC_KEY is required}"
: "${SKILL_ASSERTION_PUBLIC_KEYS_JSON:?SKILL_ASSERTION_PUBLIC_KEYS_JSON is required}"
CAREERCLAW_OPENAI_KEY="${CAREERCLAW_OPENAI_KEY:-}"

log() { echo "[deploy] $*"; }
die() { echo "[deploy] ERROR: $*" >&2; exit 1; }

ssh_deploy() { eval "ssh ${SSH_OPTS} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" "$@"; }
ssh_sudo()   { eval "ssh ${SSH_OPTS} ${LIGHTSAIL_SUDO_USER}@${LIGHTSAIL_HOST}" "$@"; }

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
  "${REPO_ROOT}/" \
  "${DEPLOY_USER}@${LIGHTSAIL_HOST}:${DEPLOY_DIR}/"

log "  Code synced to ${DEPLOY_DIR}"

log "Step 2/6 — npm ci (frozen install)..."
log "Step 3/6 — Building TypeScript..."

ssh_deploy << REMOTE
set -euo pipefail
cd "${DEPLOY_DIR}"

echo "  Running npm ci..."
npm ci --workspace=apps/worker --include-workspace-root
echo "  npm ci complete"

echo "  Building TypeScript..."
npm run build --workspace=apps/worker
echo "  Build complete"
REMOTE

log "Step 4/6 — Writing .env..."

ssh_deploy << REMOTE
set -euo pipefail
cat > "${DEPLOY_DIR}/apps/worker/.env" << EOF
PORT=${WORKER_PORT}
WORKER_SECRET=${WORKER_SECRET}
SKILL_ASSERTION_PUBLIC_KEYS_JSON=${SKILL_ASSERTION_PUBLIC_KEYS_JSON}
CAREERCLAW_WORKSPACE_DIR=${WORKSPACE_DIR}
CAREERCLAW_ANTHROPIC_KEY=${CAREERCLAW_ANTHROPIC_KEY}
CAREERCLAW_OPENAI_KEY=${CAREERCLAW_OPENAI_KEY}
CAREERCLAW_LLM_CHAIN=anthropic/claude-haiku-4-5-20251001,openai/gpt-4o-mini
EOF
chmod 600 "${DEPLOY_DIR}/apps/worker/.env"
echo "  .env written (mode 600)"
REMOTE

log "Step 5/6 — Installing systemd service..."

ssh_sudo << REMOTE
set -euo pipefail
sudo cp "${DEPLOY_DIR}/infra/lightsail/clawos-worker.service" /etc/systemd/system/clawos-worker.service
sudo systemctl daemon-reload
sudo systemctl enable clawos-worker
sudo systemctl restart clawos-worker
echo "  Service enabled and started"
sudo systemctl status clawos-worker --no-pager | head -20
REMOTE

log "Step 6/6 — Smoke testing /health..."
sleep 3

HEALTH=$(ssh_deploy "curl -sf http://localhost:${WORKER_PORT}/health || echo FAILED")

if echo "${HEALTH}" | grep -q '"status":"ok"'; then
  log "  /health OK: ${HEALTH}"
else
  die "/health failed: ${HEALTH}
  Check logs: journalctl -u clawos-worker -n 50"
fi

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Deployment complete."
log "  Worker : http://${LIGHTSAIL_HOST}:${WORKER_PORT}"
log "  Logs   : journalctl -u clawos-worker -f"
log "  Status : systemctl status clawos-worker"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
