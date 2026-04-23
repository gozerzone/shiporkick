#!/usr/bin/env bash
# Run from the Git clone root (e.g. Cloudways public_html). Use as the only post-pull hook body:
#   bash ./cloudways-deploy.sh
#
# Pull replaces index.html with the Vite *source* file (script src=/src/main.tsx). This script
# rebuilds and copies dist/ back into the web root so the live site loads hashed /assets/* bundles.
# publish-dist (via npm postbuild when SHIPORKICK_CLOUDWAYS_DEPLOY=1) copies assets/ before index.html
# to avoid a brief window where new HTML 404s JS.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ ! -f package.json ]]; then
  echo "cloudways-deploy.sh: package.json not found in $ROOT — run this from the repo root." >&2
  exit 1
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

# Ensure Node 22 from .nvmrc (Vite 8 requires 20.19+ / 22.12+). Non-interactive SSH often skips ~/.bashrc,
# so system Node 18 stays default unless we load nvm here.
if command -v nvm >/dev/null 2>&1; then
  if [[ -f "$ROOT/.nvmrc" ]]; then
    nvm install 2>/dev/null || nvm install 22
  else
    nvm install 22 2>/dev/null || true
  fi
  nvm use 22 2>/dev/null || nvm use default 2>/dev/null || true
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "cloudways-deploy.sh: node not found. Install Node 22 (nvm) for the deploy user." >&2
  exit 1
fi

NODE_MAJOR="$("$NODE_BIN" -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "${NODE_MAJOR:-0}" -lt 22 ]]; then
  echo "cloudways-deploy.sh: need Node >= 22 (found $($NODE_BIN -v)). Load nvm and nvm use 22 before deploy." >&2
  exit 1
fi

echo "cloudways-deploy.sh: using $($NODE_BIN -v) in $ROOT"

case "$(whoami 2>/dev/null || true)" in
  master_*)
    echo "cloudways-deploy.sh: WARNING — you are $(whoami). Publishing often fails with EPERM because" >&2
    echo "public_html is owned by the application user. Use SSH with APPLICATION credentials" >&2
    echo "(Access Details), not the master system user, or use Cloudways Reset Permissions + app-user deploy." >&2
    ;;
esac

npm install
npm run build

if [[ ! -f dist/index.html ]]; then
  echo "cloudways-deploy.sh: dist/index.html missing after npm run build." >&2
  exit 1
fi

if grep -q 'src="/src/main' dist/index.html || grep -q "src='/src/main" dist/index.html; then
  echo "cloudways-deploy.sh: dist/index.html still references /src/main — build misconfigured." >&2
  exit 1
fi

if ! grep -q '/assets/' dist/index.html; then
  echo "cloudways-deploy.sh: dist/index.html has no /assets/ references — aborting publish." >&2
  exit 1
fi

# Without SHIPORKICK_CLOUDWAYS_DEPLOY=1, postbuild skips publish-dist (see package.json postbuild).
if [[ "${SHIPORKICK_CLOUDWAYS_DEPLOY:-}" != "1" ]]; then
  echo "cloudways-deploy.sh: build OK. Skipping in-place publish (set SHIPORKICK_CLOUDWAYS_DEPLOY=1 on the server hook)." >&2
  exit 0
fi

# publish-dist already ran via npm postbuild when the env var was set before npm run build.
if [[ -n "${SHIPORKICK_WEBROOT:-}" ]]; then
  WEBROOT="$(cd "$SHIPORKICK_WEBROOT" && pwd)"
else
  WEBROOT="$ROOT"
fi
if ! grep -q '/assets/' "$WEBROOT/index.html" 2>/dev/null; then
  echo "cloudways-deploy.sh: $WEBROOT/index.html does not reference /assets/ — publish-dist did not update the web root." >&2
  echo "cloudways-deploy.sh: Ensure SHIPORKICK_CLOUDWAYS_DEPLOY=1 is exported before npm run build (see cloudways-post-pull.sh)." >&2
  exit 1
fi
echo "cloudways-deploy.sh: OK — web root index references /assets/ ($WEBROOT)."
