#!/usr/bin/env bash
# Require a real pg_stat_activity observation of the second session waiting
# on PostgreSQL's advisory lock, not merely a live client process.
set -euo pipefail
output="$(bash scripts/test-cross-entrypoint-niu-race.sh)"
printf '%s\n' "$output"
grep -qx 'ADVISORY_LOCK_WAIT_OBSERVED=2' <<<"$output" || {
  echo "The two-session test did not prove both advisory lock waits" >&2
  exit 1
}
