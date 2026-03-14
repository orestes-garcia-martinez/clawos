#!/usr/bin/env bash
# run-telegram-integration.sh -- Run Telegram adapter integration tests on Lightsail
#
# ── Usage ─────────────────────────────────────────────────────────────────────
#
# Bash (Linux / Mac / Git Bash):
#   bash infra/lightsail/run-telegram-integration.sh
#
# PowerShell (Windows) -- run these three commands instead of this script:
#   $sshKey = "C:\Users\<you>\.ssh\LightsailDefaultKey-us-east-1.pem"
#   $host_  = "clawos-admin@100.103.12.74"
#   $remote = "/home/clawos-admin/clawos"
#
#   scp -i "$sshKey" "apps/telegram/.env.test" "${host_}:${remote}/apps/telegram/.env.test"
#   ssh -i "$sshKey" $host_ "cd $remote && npm ci --workspace=apps/telegram --include-workspace-root --ignore-scripts --silent && npm run test:integration --workspace=apps/telegram"
#   ssh -i "$sshKey" $host_ "rm -f ${remote}/apps/telegram/.env.test"
#
# ── Prerequisites ─────────────────────────────────────────────────────────────
#
#   - apps/telegram/.env.test exists locally (filled in from .env.test.example)
#     AGENT_API_URL must be set to http://localhost:3001
#   - clawos-api and clawos-telegram services are running on Lightsail
#   - deploy-telegram.sh has already been run (code + dist on Lightsail)
#
# ── What this script does ─────────────────────────────────────────────────────
#
#   1. Copies apps/telegram/.env.test to Lightsail (never committed to git)
#   2. Runs npm run test:integration on Lightsail (localhost:3001 reachable)
#   3. Streams test output back to your terminal
#   4. Removes .env.test from Lightsail on exit (always -- even on failure)

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

LIGHTSAIL_HOST="100.103.12.74"
DEPLOY_USER="clawos-admin"
DEPLOY_DIR="/home/${DEPLOY_USER}/clawos"

# SSH key: resolved from USERPROFILE (Windows Git Bash) or HOME (Linux/Mac).
# Override by setting SSH_KEY in your environment before running this script.
SSH_KEY="${SSH_KEY:-${USERPROFILE:-$HOME}/.ssh/LightsailDefaultKey-us-east-1.pem}"
SSH_OPTS="-i \"${SSH_KEY}\" -o StrictHostKeyChecking=no"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_TEST_LOCAL="${REPO_ROOT}/apps/telegram/.env.test"
ENV_TEST_REMOTE="${DEPLOY_DIR}/apps/telegram/.env.test"

# ── Helpers ───────────────────────────────────────────────────────────────────

log() { echo "[run-telegram-integration] $*"; }
die() { echo "[run-telegram-integration] ERROR: $*" >&2; exit 1; }
ssh_r() { eval "ssh ${SSH_OPTS} ${DEPLOY_USER}@${LIGHTSAIL_HOST}" "$@"; }

# ── Guard: local .env.test must exist ────────────────────────────────────────

if [[ ! -f "${ENV_TEST_LOCAL}" ]]; then
  die "apps/telegram/.env.test not found.
  Copy apps/telegram/.env.test.example to apps/telegram/.env.test,
  set AGENT_API_URL=http://localhost:3001, fill in remaining values,
  then re-run this script."
fi

# ── Step 1: Copy .env.test to Lightsail ──────────────────────────────────────

log "Step 1/3 -- Copying .env.test to Lightsail..."

eval "scp ${SSH_OPTS} \
  \"${ENV_TEST_LOCAL}\" \
  \"${DEPLOY_USER}@${LIGHTSAIL_HOST}:${ENV_TEST_REMOTE}\""

ssh_r "chmod 600 '${ENV_TEST_REMOTE}'"
log "  .env.test copied (mode 600)"

# ── Cleanup trap: always remove .env.test from Lightsail ─────────────────────

cleanup() {
  log "Cleanup -- removing .env.test from Lightsail..."
  ssh_r "rm -f '${ENV_TEST_REMOTE}'" 2>/dev/null || true
  log "  .env.test removed."
}
trap cleanup EXIT

# ── Step 2: Run integration tests on Lightsail ───────────────────────────────

log "Step 2/3 -- Running Telegram integration tests on Lightsail..."
log "  (Real Telegram messages will be delivered to TELEGRAM_TEST_CHAT_ID)"
log ""

ssh_r << REMOTE || true
set -euo pipefail
cd "${DEPLOY_DIR}"
npm ci --workspace=apps/telegram --include-workspace-root --ignore-scripts --silent
npm run test:integration --workspace=apps/telegram
REMOTE

TEST_EXIT=$?

# ── Step 3: Report ────────────────────────────────────────────────────────────

log ""
if [[ ${TEST_EXIT} -eq 0 ]]; then
  log "Step 3/3 -- All Telegram integration tests passed on Lightsail."
else
  log "Step 3/3 -- Some tests failed (exit ${TEST_EXIT})."
  log "  Check service logs: ssh ... 'journalctl -u clawos-telegram -n 50'"
fi

exit ${TEST_EXIT}
