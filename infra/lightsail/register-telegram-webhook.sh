#!/usr/bin/env bash
# register-telegram-webhook.sh — Register the ClawOS Telegram webhook with Bot API
#
# Run from your local machine after the Telegram adapter is deployed and running:
#   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
#   WEBHOOK_URL=https://your-lightsail-ip-or-domain:3003/webhook \
#   bash infra/lightsail/register-telegram-webhook.sh
#
# What this script does:
#   1. Calls setWebhook to register the webhook URL with Telegram.
#   2. Sets the secret_token so every update includes X-Telegram-Bot-Api-Secret-Token.
#   3. Verifies the registration by calling getWebhookInfo.
#
# Re-run this script any time the webhook URL changes (e.g. domain change).
# It is safe to run multiple times -- setWebhook is idempotent.

set -euo pipefail

# ── Required env vars ─────────────────────────────────────────────────────────
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is required}"
: "${TELEGRAM_WEBHOOK_SECRET:?TELEGRAM_WEBHOOK_SECRET is required}"
: "${WEBHOOK_URL:?WEBHOOK_URL is required (e.g. https://your-domain:3003/webhook)}"

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

log() { echo "[register-webhook] $*"; }
die() { echo "[register-webhook] ERROR: $*" >&2; exit 1; }

# ── Step 1: Register the webhook ──────────────────────────────────────────────

log "Registering webhook: ${WEBHOOK_URL}"

RESPONSE=$(curl -sf -X POST "${API}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"allowed_updates\": [\"message\"],
    \"drop_pending_updates\": true
  }")

if echo "${RESPONSE}" | grep -q '"ok":true'; then
  log "  setWebhook succeeded: ${RESPONSE}"
else
  die "setWebhook failed: ${RESPONSE}"
fi

# ── Step 2: Verify the registration ──────────────────────────────────────────

log "Verifying webhook registration..."
sleep 1

INFO=$(curl -sf "${API}/getWebhookInfo")
log "  getWebhookInfo: ${INFO}"

if echo "${INFO}" | grep -q "\"url\":\"${WEBHOOK_URL}\""; then
  log "  Webhook URL confirmed."
else
  die "Webhook URL mismatch in getWebhookInfo response. Check manually: ${INFO}"
fi

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Webhook registered successfully."
log "  URL    : ${WEBHOOK_URL}"
log "  Secret : set (not shown)"
log "  Verify : curl '${API}/getWebhookInfo'"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
