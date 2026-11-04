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
// Historical note: the one-off #103/#113 Phase 3/4 release exemptions were
// removed on 31 Oct 2026 (owner decision). No new exemptions.
export function isIntegrationRelease(pr) {
  return pr?.number === 64 && pr?.base?.ref === 'main' &&
    pr?.head?.ref === 'phase2/integration-20261030';
}

// Files a machine writes and nobody reviews line by line. The limit exists to
// keep a diff readable by a person; a lock file is neither readable nor
// splittable, so counting it would mean a dependency change could never land
// at any size. The list is exact names, not a pattern, so nothing unexpected
// can quietly become uncounted.
const GENERATED = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'npm-shrinkwrap.json']);

export const isGenerated = (filename) => GENERATED.has(String(filename ?? ''));

/** Lines in generated files, which do not count toward the review budget. */
export function generatedLines(files) {
  if (!Array.isArray(files)) return 0;
  let total = 0;
  for (const file of files) {
    if (!isGenerated(file?.filename)) continue;
    const add = file?.additions;
    const del = file?.deletions;
    if (!Number.isSafeInteger(add) || add < 0 || !Number.isSafeInteger(del) || del < 0) {
      throw new Error('Invalid additions/deletions on a generated file; failing closed');
    }
    total += add + del;
  }
  return total;
}

export function validatePullRequest(pr, generated = 0) {
  if (!Number.isSafeInteger(generated) || generated < 0) {
    throw new Error('Invalid generated-line count; failing closed');
  }
  const total = changedLines(pr);
  // Never below zero: a bad files response must not buy headroom.
  const count = Math.max(0, total - Math.min(generated, total));
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

  // The file list is paginated. A PR touching more than 300 files is already
  // over any sane budget, so three pages is enough; stopping early would
  // undercount generated lines, which fails closed rather than open.
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  let generated = 0;
  for (let page = 1; page <= 3; page += 1) {
    const files = await fetchImpl(`${api}/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`, { headers });
    if (!files.ok) throw new Error(`GitHub PR files lookup failed: HTTP ${files.status}`);
    const batch = await files.json();
    if (!Array.isArray(batch)) throw new Error('Unexpected PR files payload');
    generated += generatedLines(batch);
    if (batch.length < 100) break;
  }

  const count = validatePullRequest(pr, generated);
  const outcome = isIntegrationRelease(pr) ? 'EXEMPT: exact integration aggregation only; security and CI gates remain mandatory' : 'PASS';
  const note = generated > 0 ? ` (${generated} generated lines not counted)` : '';
  process.stdout.write(`PR #${number}: ${count}/${MAX_CHANGED_LINES} changed lines${note} — ${outcome}\n`);
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGate().catch((error) => {
    console.error(`PR size gate failed: ${error.message}`);
    process.exitCode = 1;
  });
}
