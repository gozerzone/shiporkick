#!/usr/bin/env bash
# Cloudways "Deployment via GIT" → post-pull / post-deployment script (Layout 1: repo root = public_html).
# Configure the panel to run ONE of:
#   bash ./cloudways-post-pull.sh
#   bash /home/master/applications/YOUR_APP_ID/public_html/cloudways-post-pull.sh
#
# Git pull restores dev index.html (/src/main.tsx). This script runs cloudways-deploy.sh so dist/
# is built and published into this directory (built index + assets/).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi
if command -v nvm >/dev/null 2>&1; then
  nvm use 22 2>/dev/null || nvm install 22 2>/dev/null || true
fi

export SHIPORKICK_CLOUDWAYS_DEPLOY=1
exec bash "$REPO_ROOT/cloudways-deploy.sh"
