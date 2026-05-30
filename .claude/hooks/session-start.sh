#!/bin/bash
# SessionStart hook — Claude Code on the web.
#
# Fresh web-session containers clone the repo WITHOUT node_modules, so `npm
# test`, `npx tsc`, `npx eslint` and `npm run build` all fail with
# "tsx: not found" / "next: not found" until deps are installed. This hook
# installs them up front so the agent can run the test suite + linters
# immediately.
#
# Synchronous + idempotent. `npm install` (not `npm ci`) so the container's
# post-hook cache is reused across sessions. Local (non-web) sessions skip
# this — developers manage their own node_modules.
set -euo pipefail

# Only run in Claude Code on the web; local dev manages its own install.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

if [ -d node_modules ] && [ -x node_modules/.bin/tsx ]; then
  echo "Dependencies already present — skipping install."
  exit 0
fi

echo "Installing npm dependencies for the web session…"
npm install --no-audit --no-fund
echo "Dependencies installed. \`npm test\`, lint, and build are ready."
