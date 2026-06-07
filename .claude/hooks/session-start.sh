#!/bin/bash
# SessionStart hook — Claude Code on the web.
#
# Prepares a fresh web-session container so the agent is productive immediately:
#   1. Installs node_modules (web containers clone WITHOUT them, so `npm test`,
#      `npx tsc`, `npx eslint`, `npm run build` would otherwise fail with
#      "tsx: not found" / "next: not found").
#   2. Seeds the Core demo dataset into the local `.data` store so the live
#      `/core/*` surfaces (POS · KDS · Guest · Service) are populated for
#      preview instead of showing empty states.
#
# Synchronous + idempotent. `npm install` (not `npm ci`) so the container's
# post-hook cache is reused across sessions. Local (non-web) sessions skip
# everything — developers manage their own node_modules and data.
set -euo pipefail

# Only run in Claude Code on the web; local dev manages its own setup.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# --- 1. Dependencies ------------------------------------------------------
if [ -d node_modules ] && [ -x node_modules/.bin/tsx ]; then
  echo "Dependencies already present — skipping install."
else
  echo "Installing npm dependencies for the web session…"
  npm install --no-audit --no-fund
  echo "Dependencies installed."
fi

# --- 2. Core demo data (preview only) -------------------------------------
# Populates the local `.data` filesystem store so /core/* shows a full picture.
# The seeder is idempotent (clears only its own `demo-` rows first). Skipped
# when SEED_DEMO=0, or when a real DATABASE_URL is configured — this hook never
# auto-writes a hosted DB; seed that explicitly with `ALLOW_DB_SEED=1`.
if [ "${SEED_DEMO:-1}" = "0" ]; then
  echo "SEED_DEMO=0 — skipping Core demo seed."
elif [ -n "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is set — skipping filesystem auto-seed."
  echo "  To seed a throwaway preview DB:  ALLOW_DB_SEED=1 npm run seed:demo"
else
  echo "Seeding Core demo data into .data (set SEED_DEMO=0 to skip)…"
  # Non-fatal: a seed failure must never block the session. The `if` keeps
  # `set -e` from aborting on a non-zero exit.
  if npm run --silent seed:demo; then
    echo "Core demo data seeded — /core/* will show a full picture."
  else
    echo "WARN: Core demo seed failed (non-fatal); continuing." >&2
  fi
fi

echo "Web session ready."
