#!/usr/bin/env bash
#
# Setup script for a Claude Code cloud environment.
#
# This is NOT run by the repo's own tooling. Paste its contents into the
# "Setup script" field of your cloud environment at claude.ai/code
# (environment selector -> edit -> Setup script). It runs once after the
# repository is cloned and before the session starts, and the result is cached.
#
# Keep it under roughly five minutes. The cache is only written if the script
# finishes inside that budget; exceed it and every session pays the cost again,
# or stalls during provisioning.
#
# It must also stay non-fatal wherever it can. A non-zero exit blocks the
# session from starting at all, which is a bad trade for a convenience step.

set -euo pipefail

echo "--- KIMA cloud setup ---"
node --version
npm --version

# npm ci, not npm install: it installs exactly what package-lock.json pins and
# fails loudly if the lockfile and package.json disagree. In a throwaway VM
# that determinism is the whole point.
echo "Installing dependencies..."
npm ci --no-audit --fund=false

# A typecheck here is cheap and surfaces a broken base commit immediately,
# rather than letting the session discover it halfway through a task on a phone
# screen. Non-fatal on purpose: a pre-existing error should not stop you
# working on something unrelated.
echo "Typechecking..."
npm run typecheck || echo "WARNING: typecheck failed on the base commit — see above."

# Env vars are NOT set here. They belong on the cloud environment
# (claude.ai/code -> environment -> Environment variables) so they stay out of
# git. lib/supabase.ts throws without them, so say so plainly now rather than
# letting a later command fail with an unexplained stack trace.
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  echo "NOTE: NEXT_PUBLIC_SUPABASE_URL is not set on this environment."
  echo "      Build and typecheck still work; anything that talks to Supabase will not."
  echo "      Add it under Environment variables. See .env.example."
fi

echo "--- setup complete ---"
