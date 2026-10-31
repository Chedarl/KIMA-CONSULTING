import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedLines, validatePullRequest, runGate } from './pr-size-gate.mjs';

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

test('only Phase 3/4 integration PR #103 may aggregate changes on the isolated branch', () => {
  const integration = { number: 103, additions: 5000, deletions: 500,
    base: { ref: 'integration/phase3-phase4-20261031' },
    head: { ref: 'integration/phase3-phase4-resolved-20261031' } };
  assert.equal(validatePullRequest(integration), 5500);
  assert.throws(() => validatePullRequest({ ...integration, number: 104 }), /5500.*300/);
  assert.throws(() => validatePullRequest({ ...integration, base: { ref: 'main' } }), /5500.*300/);
  assert.throws(() => validatePullRequest({ ...integration, head: { ref: 'some-other-branch' } }), /5500.*300/);
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
test('live lookup rejects an oversized PR', async () => {
  await assert.rejects(runGate(env, async () => ({
    ok: true, json: async () => ({ number: 67, additions: 301, deletions: 0 }),
  })), /301.*300/);
});
