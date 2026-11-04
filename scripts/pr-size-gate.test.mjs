import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedLines, validatePullRequest, runGate, generatedLines } from './pr-size-gate.mjs';

test('counts additions plus deletions (not just additions)', () => {
  assert.equal(changedLines({ additions: 175, deletions: 125 }), 300);
});
test('300 changed lines is permitted', () => {
  assert.doesNotThrow(() => validatePullRequest({ number: 45, additions: 150, deletions: 150 }));
});
test('301 changed lines is blocked', () => {
  assert.throws(() => validatePullRequest({ number: 45, additions: 300, deletions: 1 }), /301.*300/);
});
test('explicit release aggregation #64 may exceed 300 changed lines, not other PRs', () => {
  const release = {
    number: 64, additions: 4200, deletions: 200,
    base: { ref: 'main' }, head: { ref: 'phase2/integration-20261030' },
  };
  assert.equal(validatePullRequest(release), 4400);
  assert.throws(() => validatePullRequest({ ...release, number: 65 }), /4400.*300/);
  assert.throws(() => validatePullRequest({ ...release, base: { ref: 'develop' } }), /4400.*300/);
  assert.throws(() => validatePullRequest({ ...release, head: { ref: 'another-branch' } }), /4400.*300/);
});

test('the one-off #103/#113 Phase 3/4 exemptions are gone (removed 31 Oct 2026)', () => {
  const integration = { number: 103, additions: 5000, deletions: 500,
    base: { ref: 'integration/phase3-phase4-20261031' },
    head: { ref: 'integration/phase3-phase4-resolved-20261031' } };
  assert.throws(() => validatePullRequest(integration), /5500.*300/);
  const release = { number: 113, additions: 5000, deletions: 200,
    base: { ref: 'main' },
    head: { ref: 'release/phase3-phase4-mainbased-20261031' } };
  assert.throws(() => validatePullRequest(release), /5200.*300/);
});

test('missing or invalid size metadata fails closed', () => {
  for (const payload of [{}, { additions: 0 }, { additions: -1, deletions: 2 },
    { additions: 3.5, deletions: 0 }, { additions: '100', deletions: 2 }]) {
    assert.throws(() => changedLines(payload));
  }
});
test('valid smaller pull request is accepted', () => {
  assert.equal(validatePullRequest({ number: 51, additions: 20, deletions: 4 }), 24);
});

const env = { GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'owner/repo', PR_NUMBER: '67' };
test('GitHub API errors fail closed', async () => {
  await assert.rejects(runGate(env, async () => ({ ok: false, status: 403 })), /HTTP 403/);
});
test('missing GitHub token fails closed without fetching', async () => {
  await assert.rejects(runGate({ ...env, GITHUB_TOKEN: '' }, () => {
    throw new Error('fetch should not be called');
  }), /Missing or invalid/);
});
test('unexpected PR identity fails closed', async () => {
  await assert.rejects(runGate(env, async () => ({
    ok: true, json: async () => ({ number: 68, additions: 2, deletions: 3 }),
  })), /Unexpected PR identity/);
});
// The gate now asks for the file list too, so a mock has to answer both calls.
const stub = (pr, files = []) => async (url) =>
  String(url).includes('/files')
    ? { ok: true, json: async () => files }
    : { ok: true, json: async () => pr };

test('live lookup rejects an oversized PR', async () => {
  await assert.rejects(
    runGate(env, stub({ number: 67, additions: 301, deletions: 0 })),
    /301.*300/,
  );
});

test('a lock file does not spend the review budget', async () => {
  const count = await runGate(
    env,
    stub({ number: 67, additions: 480, deletions: 79 }, [
      { filename: 'package-lock.json', additions: 435, deletions: 75 },
      { filename: 'lib/utils.ts', additions: 14, deletions: 0 },
      { filename: 'package.json', additions: 7, deletions: 2 },
      { filename: 'tailwind.config.ts', additions: 4, deletions: 1 },
      { filename: 'components.json', additions: 20, deletions: 0 },
    ]),
  );
  assert.equal(count, 49);
});

test('excluding a lock file cannot rescue an oversized source diff', async () => {
  await assert.rejects(
    runGate(
      env,
      stub({ number: 67, additions: 900, deletions: 0 }, [
        { filename: 'package-lock.json', additions: 500, deletions: 0 },
        { filename: 'app/huge.tsx', additions: 400, deletions: 0 },
      ]),
    ),
    /400.*300/,
  );
});

test('only exact generated names are exempt', () => {
  assert.equal(generatedLines([{ filename: 'package-lock.json', additions: 10, deletions: 5 }]), 15);
  assert.equal(generatedLines([{ filename: 'docs/package-lock.json.md', additions: 10, deletions: 5 }]), 0);
  assert.equal(generatedLines([{ filename: 'src/lock.ts', additions: 10, deletions: 5 }]), 0);
  assert.equal(generatedLines(undefined), 0);
});

test('a malformed generated-file entry fails closed', () => {
  assert.throws(() => generatedLines([{ filename: 'package-lock.json', additions: '10', deletions: 5 }]));
  assert.throws(() => generatedLines([{ filename: 'yarn.lock', additions: -1, deletions: 0 }]));
  assert.throws(() => validatePullRequest({ number: 1, additions: 10, deletions: 0 }, -5));
});

test('a generated count larger than the diff cannot go negative', () => {
  assert.equal(validatePullRequest({ number: 1, additions: 10, deletions: 0 }, 999), 0);
});

test('a failed file lookup fails closed', async () => {
  await assert.rejects(
    runGate(env, async (url) =>
      String(url).includes('/files')
        ? { ok: false, status: 502 }
        : { ok: true, json: async () => ({ number: 67, additions: 10, deletions: 0 }) },
    ),
    /files lookup failed: HTTP 502/,
  );
});
