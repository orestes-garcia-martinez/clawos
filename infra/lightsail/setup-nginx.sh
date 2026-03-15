#!/usr/bin/env bash
# setup-nginx.sh — Install Nginx + Certbot and configure HTTPS for the API.
#
# Usage (on the Lightsail instance):
#   chmod +x infra/lightsail/setup-nginx.sh
#   ./infra/lightsail/setup-nginx.sh api.yourdomain.com admin@yourdomain.com
#
# Prerequisites BEFORE running:
#   1. Point an A record:  api.yourdomain.com → 100.103.12.74
#   2. Open ports 80 and 443 in the Lightsail console (Networking tab).
#   3. clawos-api.service must be running on localhost:3001.
#
# After a successful run:
#   1. Update apps/api/.env: ALLOWED_ORIGIN=https://<your-vercel-domain>
#   2. Update apps/web/.env: VITE_API_URL=https://api.yourdomain.com
#   3. Redeploy the API: ./infra/lightsail/deploy-api.sh
#   4. Redeploy the web: push to main → Vercel CI picks it up.

set -euo pipefail

API_DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$API_DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: $0 <api-domain> <email>"
  echo "Example: $0 api.clawos.io admin@clawos.io"
  exit 1
fi

echo "[nginx] Installing Nginx..."
sudo apt-get update -q
sudo apt-get install -y nginx

echo "[nginx] Installing Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

echo "[nginx] Writing config for $API_DOMAIN..."
CONF_SRC="$(dirname "$0")/nginx-api.conf"
CONF_DST="/etc/nginx/sites-available/clawos-api"

# Substitute API_DOMAIN placeholder
sudo sed "s/API_DOMAIN/$API_DOMAIN/g" "$CONF_SRC" | sudo tee "$CONF_DST" > /dev/null

# Disable default site if present
sudo rm -f /etc/nginx/sites-enabled/default

# Enable clawos-api site
sudo ln -sf "$CONF_DST" /etc/nginx/sites-enabled/clawos-api

echo "[nginx] Testing Nginx config..."
sudo nginx -t

echo "[nginx] Starting Nginx..."
sudo systemctl enable nginx
sudo systemctl start nginx

echo "[certbot] Obtaining certificate for $API_DOMAIN..."
sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$API_DOMAIN"

echo "[nginx] Reloading Nginx with SSL config..."
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "================================================================"
echo " HTTPS ready: https://$API_DOMAIN"
echo ""
echo " Next steps:"
echo "   1. Set ALLOWED_ORIGIN in apps/api/.env to your Vercel domain"
echo "   2. Set VITE_API_URL=https://$API_DOMAIN in Vercel env vars"
echo "   3. Run: ./infra/lightsail/deploy-api.sh"
echo "   4. Push web to main to trigger Vercel redeploy"
echo "================================================================"
