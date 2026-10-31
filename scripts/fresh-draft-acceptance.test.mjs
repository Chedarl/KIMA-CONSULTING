import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { firmAskedAgain, freshDraftNeedsAcceptance } from "../lib/engagements.ts";

const draft = {
  status: "draft",
  accepted_at: null,
  authorized_at: null,
  revoked_at: null,
};

test("a returning client's fresh draft is waiting for acceptance", () => {
  assert.equal(freshDraftNeedsAcceptance(draft), true);
});

test("an authorised or already accepted engagement is not that draft", () => {
  assert.equal(freshDraftNeedsAcceptance({ ...draft, authorized_at: "2026-10-31T00:00:00Z" }), false);
  assert.equal(freshDraftNeedsAcceptance({ ...draft, accepted_at: "2026-10-31T00:00:00Z", status: "accepted" }), false);
  assert.equal(freshDraftNeedsAcceptance({ ...draft, revoked_at: "2026-10-31T00:00:00Z", status: "revoked" }), false);
});

test("asking-again copy is only for a prior revoked engagement of the same firm", () => {
  const prior = { id: "old", organization_id: "firm-a", revoked_at: "2026-01-01" };
  assert.equal(firmAskedAgain("new", "firm-a", [prior]), true);
  assert.equal(firmAskedAgain("new", "firm-b", [prior]), false);
  assert.equal(firmAskedAgain("new", "firm-a", [{ ...prior, revoked_at: null }]), false);
});

test("the services board accepts only a still-open draft and does not send the clock", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  assert.match(board, /freshDraftNeedsAcceptance\(e\)/);
  assert.match(board, /\.eq\("status", "draft"\)/);
  assert.match(board, /\.is\("accepted_at", null\)/);
  assert.match(board, /\.select\("id"\)/);
  assert.match(board, /error \|\| !data \|\| data\.length === 0/);
  assert.doesNotMatch(board, /accepted_at: new Date/);
  assert.match(board, /acceptDraftHintAgain/);
  const copy = readFileSync("lib/i18n-portal.ts", "utf8");
  assert.match(copy, /acceptDraftHintAgain: "Votre cabinet vous redemande/);
  assert.match(copy, /acceptDraftHint: "Accept this engagement so the firm can begin/);
});
