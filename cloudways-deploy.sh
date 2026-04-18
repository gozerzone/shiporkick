#!/usr/bin/env bash
# Run from the Git clone root (e.g. Cloudways public_html). Use as the only post-pull hook body:
#   bash ./cloudways-deploy.sh
#
# Pull replaces index.html with the Vite *source* file (script src=/src/main.tsx). This script
# rebuilds and copies dist/ back into the web root so the live site loads hashed /assets/* bundles.

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

if command -v nvm >/dev/null 2>&1; then
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

# Without this, a developer who runs this script locally would replace the Vite dev index.html.
if [[ "${SHIPORKICK_CLOUDWAYS_DEPLOY:-}" != "1" ]]; then
  echo "cloudways-deploy.sh: build OK. Skipping in-place publish (set SHIPORKICK_CLOUDWAYS_DEPLOY=1 on the server hook)." >&2
  exit 0
fi

PUBLISH_ROOT="${SHIPORKICK_WEBROOT:-$ROOT}"
PUBLISH_ROOT="$(cd "$PUBLISH_ROOT" && pwd)"

cp -f dist/index.html "$PUBLISH_ROOT/index.html"
rm -rf "$PUBLISH_ROOT/assets"
cp -R dist/assets "$PUBLISH_ROOT/assets"
if [[ -f dist/.htaccess ]]; then
  cp -f dist/.htaccess "$PUBLISH_ROOT/.htaccess"
fi

if ! grep -q '/assets/' "$PUBLISH_ROOT/index.html"; then
  echo "cloudways-deploy.sh: published index.html has no /assets/ — publish failed." >&2
  exit 1
fi

echo "cloudways-deploy.sh: OK — published Vite dist into $PUBLISH_ROOT"
