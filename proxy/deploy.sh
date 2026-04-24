#!/usr/bin/env bash
set -euo pipefail

# Deploy-Script: synct `proxy/` lokal → IONOS-VM und startet den Service neu.
# Voraussetzung: SSH-User `signflow` existiert auf der VM, app-Struktur liegt
# unter /home/signflow/app, systemd-Unit ist installiert.

SSH_HOST="${SSH_HOST:-signflow@anon.signflow.coach}"
REMOTE_APP="/home/signflow/app"

here="$(cd "$(dirname "$0")" && pwd)"

echo "→ syncing $here to $SSH_HOST:$REMOTE_APP"
rsync -az --delete \
  --exclude node_modules \
  --exclude python/.venv \
  --exclude .env \
  "$here"/ "$SSH_HOST:$REMOTE_APP/"

echo "→ installing deps"
ssh "$SSH_HOST" "cd $REMOTE_APP && npm install --omit=dev"

echo "→ restart anon-proxy"
ssh "$SSH_HOST" "sudo systemctl restart anon-proxy"

echo "→ healthcheck"
ssh "$SSH_HOST" "curl -fsS http://127.0.0.1:3000/healthz"
echo
echo "done."
