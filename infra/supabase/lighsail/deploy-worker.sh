#!/usr/bin/env bash
# deploy-worker.sh — ClawOS Lightsail Skill Worker deployment
#
# Run from your local machine:
#   bash infra/lightsail/deploy-worker.sh
#
# Prerequisites:
#   - SSH access: ssh -i "$USERPROFILE/.ssh/LightsailDefaultKey-us-east-1.pem" openclaw-admin@100.103.12.74
#   - WORKER_SECRET, CAREERCLAW_ANTHROPIC_KEY, CAREERCLAW_OPENAI_KEY set in your shell
#
# What this script does:
#   1. Creates clawos-admin user (copies authorized_keys from openclaw-admin)
#   2. Installs Node.js 22 LTS if not present
#   3. Creates workspace directory with correct permissions
#   4. Syncs repo code to the server
#   5. Runs npm ci (frozen dependencies — never npm install)
#   6. Builds TypeScript
#   7. Writes .env file from shell env vars (never stored in repo)
#   8. Installs and enables systemd service
#   9. Smoke-tests the /health endpoint

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

LIGHTSAIL_HOST="100.103.12.74"
LIGHTSAIL_USER="openclaw-admin"  # existing user — we create clawos-admin below
SSH_KEY="${USERPROFILE:-$HOME}/.ssh/LightsailDefaultKey-us-east-1.pem"
DEPLOY_USER="clawos-admin"
DEPLOY_DIR="/home/${DEPLOY_USER}/clawos"
WORKSPACE_DIR="/home/${DEPLOY_USER}/careerclaw-workspace"
WORKER_PORT="${WORKER_PORT:-3002}"

# Validate required env vars before touching the server
: "${WORKER_SECRET:?WORKER_SECRET is required}"
: "${CAREERCLAW_ANTHROPIC_KEY:?CAREERCLAW_ANTHROPIC_KEY is required}"
# CAREERCLAW_OPENAI_KEY is optional (failover chain)
CAREERCLAW_OPENAI_KEY="${CAREERCLAW_OPENAI_KEY:-}"

SSH_CMD="ssh -i \"${SSH_KEY}\" -o StrictHostKeyChecking=no"
SCP_CMD="scp -i \"${SSH_KEY}\" -o StrictHostKeyChecking=no"

log() { echo "[deploy] $*"; }
die() { echo "[deploy] ERROR: $*" >&2; exit 1; }

# ── Step 1: Create clawos-admin user ─────────────────────────────────────────
# Strategy: create fresh user, copy authorized_keys, migrate ownership.
# Safer than renaming openclaw-admin (avoids home-dir path, systemd, and
# authorized_keys location issues from an in-place rename).

log "Step 1/9 — Creating ${DEPLOY_USER} user..."
eval "${SSH_CMD} ${LIGHTSAIL_USER}@${LIGHTSAIL_HOST}" << 'REMOTE'
set -euo pipefail

DEPLOY_USER="clawos-admin"

if id "${DEPLOY_USER}" &>/dev/null; then
  echo "  ${DEPLOY_USER} already exists — skipping creation"
else
  sudo adduser --disabled-password --gecos "" "${DEPLOY_USER}"
  sudo mkdir -p "/home/${DEPLOY_USER}/.ssh"
  # Copy authorized keys from the existing admin user
  sudo cp ~/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  sudo chmod 700 "/home/${DEPLOY_USER}/.ssh"
  sudo chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  sudo chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
  echo "  ${DEPLOY_USER} created with SSH access"
fi
REMOTE

# ── Step 2: Install Node.js 22 LTS ───────────────────────────────────────────

log "Step 2/9 — Installing Node.js 22 LTS..."
eval "${SSH_CMD} ${LIGHTSAIL_USER}@${LIGHTSAIL_HOST}" << 'REMOTE'
set -euo pipefail

NODE_MAJOR=22
INSTALLED_VERSION=$(node --version 2>/dev/null | grep -oP '(?<=v)\d+' || echo "0")

if [ "${INSTALLED_VERSION}" -ge "${NODE_MAJOR}" ]; then
  echo "  Node.js $(node --version) already installed — skipping"
else
  echo "  Installing Node.js ${NODE_MAJOR} LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  echo "  Installed: $(node --version)"
fi

# Verify npm is available
npm --version > /dev/null || die "npm not found after Node install"
REMOTE

# ── Step 3: Create workspace directory ───────────────────────────────────────

log "Step 3/9 — Creating workspace directory..."
eval "${SSH_CMD} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" << REMOTE
set -euo pipefail
mkdir -p "${WORKSPACE_DIR}"
chmod 750 "${WORKSPACE_DIR}"
echo "  Workspace ready: ${WORKSPACE_DIR}"
REMOTE

# ── Step 4: Sync repo code ────────────────────────────────────────────────────
# Rsync the relevant parts of the monorepo. Excludes node_modules and dist
# (rebuilt on server after sync).

log "Step 4/9 — Syncing code to server..."

# Determine repo root (script is in infra/lightsail/)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

eval "${SSH_CMD} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" "mkdir -p ${DEPLOY_DIR}"

rsync -avz --delete \
  -e "ssh -i \"${SSH_KEY}\" -o StrictHostKeyChecking=no" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.turbo' \
  --exclude='*.tsbuildinfo' \
  --exclude='.env' \
  "${REPO_ROOT}/" \
  "${DEPLOY_USER}@${LIGHTSAIL_HOST}:${DEPLOY_DIR}/"

log "  Code synced to ${DEPLOY_DIR}"

# ── Step 5: npm ci ────────────────────────────────────────────────────────────
# Frozen install — exactly what's in package-lock.json. Never npm install.

log "Step 5/9 — Running npm ci (frozen install)..."
eval "${SSH_CMD} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" << REMOTE
set -euo pipefail
cd "${DEPLOY_DIR}"
npm ci --workspace=apps/worker --include-workspace-root
echo "  npm ci complete"
REMOTE

# ── Step 6: Build TypeScript ──────────────────────────────────────────────────

log "Step 6/9 — Building TypeScript..."
eval "${SSH_CMD} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" << REMOTE
set -euo pipefail
cd "${DEPLOY_DIR}"
npm run build --workspace=apps/worker
echo "  Build complete"
REMOTE

# ── Step 7: Write .env file ───────────────────────────────────────────────────
# Secrets are passed as env vars from the caller's shell — never stored in repo.

log "Step 7/9 — Writing .env file..."
eval "${SSH_CMD} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" << REMOTE
set -euo pipefail
ENV_FILE="${DEPLOY_DIR}/apps/worker/.env"
cat > "\${ENV_FILE}" << 'EOF'
PORT=${WORKER_PORT}
WORKER_SECRET=${WORKER_SECRET}
CAREERCLAW_WORKSPACE_DIR=${WORKSPACE_DIR}
CAREERCLAW_ANTHROPIC_KEY=${CAREERCLAW_ANTHROPIC_KEY}
CAREERCLAW_OPENAI_KEY=${CAREERCLAW_OPENAI_KEY}
CAREERCLAW_LLM_CHAIN=anthropic/claude-haiku-4-5-20251001,openai/gpt-4o-mini
EOF
chmod 600 "\${ENV_FILE}"
echo "  .env written (mode 600)"
REMOTE

# ── Step 8: Install and enable systemd service ────────────────────────────────

log "Step 8/9 — Installing systemd service..."
eval "${SSH_CMD} ${LIGHTSAIL_USER}@${LIGHTSAIL_HOST}" << REMOTE
set -euo pipefail
sudo cp "${DEPLOY_DIR}/infra/lightsail/clawos-worker.service" /etc/systemd/system/clawos-worker.service
sudo systemctl daemon-reload
sudo systemctl enable clawos-worker
sudo systemctl restart clawos-worker
echo "  Service enabled and started"
sudo systemctl status clawos-worker --no-pager | head -20
REMOTE

# ── Step 9: Smoke test ────────────────────────────────────────────────────────

log "Step 9/9 — Smoke testing /health endpoint..."
sleep 3  # Give the service a moment to start

HEALTH_RESPONSE=$(eval "${SSH_CMD} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" \
  "curl -sf http://localhost:${WORKER_PORT}/health || echo 'HEALTH_FAILED'")

if echo "${HEALTH_RESPONSE}" | grep -q '"status":"ok"'; then
  log "  /health OK: ${HEALTH_RESPONSE}"
else
  die "/health check failed. Response: ${HEALTH_RESPONSE}
  Check logs with: journalctl -u clawos-worker -n 50"
fi

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Deployment complete."
log ""
log "Worker running on ${LIGHTSAIL_HOST}:${WORKER_PORT}"
log "Service: clawos-worker (systemd)"
log "Logs:    journalctl -u clawos-worker -f"
log "Status:  systemctl status clawos-worker"
log ""
log "Next step: Chat 4 — Agent API"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
