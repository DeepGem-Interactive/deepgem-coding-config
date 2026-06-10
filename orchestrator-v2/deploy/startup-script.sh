#!/usr/bin/env bash
# GCE startup script for the dgorch engine VM (debian-12).
#
# Runs as root on EVERY boot, so every step is idempotent. It installs the
# toolchain and builds the engine; it does NOT start the engine or the tunnel —
# those need credentials (Linear key, Claude auth) that only the human can
# provide. See deploy/README.md for the manual steps.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

REPO_URL="https://github.com/DeepGem-Interactive/deepgem-coding-config.git"
CLONE_DIR="/opt/deepgem-coding-config"

echo "dgorch startup: base packages"
apt-get update
apt-get install -y --no-install-recommends git curl ca-certificates gnupg

echo "dgorch startup: Node 22 (nodesource)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "dgorch startup: cloudflared (cloudflare apt repo)"
if ! command -v cloudflared >/dev/null 2>&1; then
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    | tee /etc/apt/sources.list.d/cloudflared.list
  apt-get update
  apt-get install -y cloudflared
fi

echo "dgorch startup: clone + build orchestrator-v2"
if [[ ! -d "$CLONE_DIR/.git" ]]; then
  git clone "$REPO_URL" "$CLONE_DIR"
fi
cd "$CLONE_DIR/orchestrator-v2"
npm ci
npm run build

# Make the checkout writable by SSH users (GCE SSH users are in the google-sudoers
# group; adm is present on all debian images and covers the common case).
chgrp -R adm "$CLONE_DIR" || true
chmod -R g+w "$CLONE_DIR" || true

echo "dgorch startup: done. Engine built at $CLONE_DIR/orchestrator-v2/dist/index.js"
echo "dgorch startup: NEXT (manual, see deploy/README.md): Linear key at ~/.dgorch/linear.key,"
echo "dgorch startup:   Claude auth (claude login or ANTHROPIC_API_KEY), cloudflared tunnel,"
echo "dgorch startup:   then: node dist/index.js serve --repo <project> --prd <prd> --webhook-port 8787"
