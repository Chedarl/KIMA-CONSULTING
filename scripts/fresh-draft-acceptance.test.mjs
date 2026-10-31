import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { freshDraftNeedsAcceptance } from "../lib/engagements.ts";

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

test("the services board offers accept on that draft and writes accepted", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  assert.match(board, /freshDraftNeedsAcceptance\(e\)/);
  assert.match(board, /status: "accepted", accepted_at:/);
  assert.match(board, /copy\.acceptDraft/);
  const fr = readFileSync("lib/i18n-portal.ts", "utf8");
  assert.match(fr, /acceptDraft: "Accepter la mission"/);
  assert.match(fr, /acceptDraft: "Accept this engagement"/);
});
