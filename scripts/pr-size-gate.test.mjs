import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedLines, validatePullRequest } from './pr-size-gate.mjs';

test('counts additions plus deletions (not just additions)', () => {
  assert.equal(changedLines({ additions: 175, deletions: 125 }), 300);
});
test('300 changed lines is permitted', () => {
  assert.doesNotThrow(() => validatePullRequest({ number: 45, additions: 150, deletions: 150 }));
});
test('301 changed lines is blocked', () => {
  assert.throws(() => validatePullRequest({ number: 45, additions: 300, deletions: 1 }), /301.*300/);
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
