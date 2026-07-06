#!/usr/bin/env bash
# Quick local dev bootstrapper: Amplify sandbox (backend) + Vite dev server (frontend).
# Kept intentionally light — a couple of fast sanity checks, then start both.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "==> node_modules missing, running npm install..."
  npm install
fi

echo "==> Checking ANTHROPIC_API_KEY is set for this sandbox..."
if ! npx ampx sandbox secret list 2>/dev/null | grep -q "ANTHROPIC_API_KEY"; then
  echo "==> ANTHROPIC_API_KEY is not set for this sandbox."
  echo "    Run: npx ampx sandbox secret set ANTHROPIC_API_KEY"
  exit 1
fi

echo "==> Typechecking..."
npx tsc -b

echo "==> Starting Amplify sandbox (backend)..."
npx ampx sandbox &
SANDBOX_PID=$!
trap 'echo "==> Stopping sandbox..."; kill "$SANDBOX_PID" 2>/dev/null' EXIT

echo ""
echo "==> Local app: http://localhost:5173"
echo "    (if port 5173 is busy, Vite will print the actual URL below instead)"
echo ""

# Frontend dev server runs in the foreground — Ctrl+C stops this and the sandbox together.
npm run dev
