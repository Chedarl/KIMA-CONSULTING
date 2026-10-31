// Phase 2 PR gate: GitHub reports changed lines as additions + deletions.
// Do not use a git diff against main here: PR bases may be stacked or moving.
import { pathToFileURL } from 'node:url';

export const MAX_CHANGED_LINES = 300;

export function changedLines(pr) {
  if (!pr || !Number.isSafeInteger(pr.additions) || pr.additions < 0 ||
      !Number.isSafeInteger(pr.deletions) || pr.deletions < 0) {
    throw new Error('Missing or invalid PR additions/deletions; failing closed');
  }
  const count = pr.additions + pr.deletions;
  if (!Number.isSafeInteger(count)) throw new Error('Invalid changed-line sum');
  return count;
}

// The release-only collection PR aggregates previously reviewed <=300-line
// changes. Its diff necessarily exceeds the per-feature limit; allow only
// this exact, owner-authorized PR #64, not a name/prefix-based escape hatch.
export function isIntegrationRelease(pr) {
  const phase2 = pr?.number === 64 && pr?.base?.ref === 'main' &&
    pr?.head?.ref === 'phase2/integration-20261030';
  const nonProductionPhase34 = pr?.number === 103 &&
    pr?.base?.ref === 'integration/phase3-phase4-20261031' &&
    pr?.head?.ref === 'integration/phase3-phase4-resolved-20261031';
  // Release aggregation only: exact owner-authorized P3/P4 candidate targeting main.
  // No exemption for individual feature PRs or a differently named branch.
  const phase34Release = pr?.number === 113 && pr?.base?.ref === 'main' &&
    pr?.head?.ref === 'release/phase3-phase4-mainbased-20261031';
  return phase2 || nonProductionPhase34 || phase34Release;
}

export function validatePullRequest(pr) {
  const count = changedLines(pr);
  if (count > MAX_CHANGED_LINES && !isIntegrationRelease(pr)) {
    throw new Error(`PR #${pr.number ?? '?'} changes ${count} lines (limit ${MAX_CHANGED_LINES}); split into smaller PRs`);
  }
  return count;
}

export async function runGate(env = process.env, fetchImpl = globalThis.fetch) {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: number } = env;
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
      !/^[1-9]\d*$/.test(number ?? '')) {
    throw new Error('Missing or invalid GitHub PR context; failing closed');
  }
  const api = env.GITHUB_API_URL || 'https://api.github.com';
  const response = await fetchImpl(`${api}/repos/${repo}/pulls/${number}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub PR lookup failed: HTTP ${response.status}`);
  const pr = await response.json();
  if (String(pr.number) !== number) throw new Error('Unexpected PR identity');
  const count = validatePullRequest(pr);
  const outcome = isIntegrationRelease(pr) ? 'EXEMPT: exact integration aggregation only; security and CI gates remain mandatory' : 'PASS';
  process.stdout.write(`PR #${number}: ${count}/${MAX_CHANGED_LINES} changed lines — ${outcome}\n`);
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGate().catch((error) => {
    console.error(`PR size gate failed: ${error.message}`);
    process.exitCode = 1;
  });
}
