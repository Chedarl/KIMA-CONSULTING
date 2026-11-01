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

// A stale card must not accept a draft that gained firm authorization or was revoked.
// Request-shape contracts; database RLS and triggers remain authoritative.
test("acceptance rechecks all fresh-draft state predicates at write time", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  const match = board.match(/async function acceptDraft\(id: string\) \{([\s\S]*?)\n  \}\n\n  async function sendRequest/);
  assert.ok(match, "acceptDraft function must be present");
  const write = match[1];
  assert.match(write, /\.eq\("status", "draft"\)/);
  assert.match(write, /\.is\("accepted_at", null\)/);
  assert.match(write, /\.is\("authorized_at", null\)/);
  assert.match(write, /\.is\("revoked_at", null\)/);
  assert.match(write, /\.select\("id"\)/);
});


// The services board contains taxpayer-specific records and must never show
// a previous account's cards after sign-out or account switching.
// These source contracts require separate authenticated browser verification.
test("services board invalidates stale reads and clears tenant state on identity changes", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  assert.match(board, /const loadEpoch = useRef\(0\)/);
  assert.match(board, /const identityRef = useRef<string \| null \| undefined>\(undefined\)/);
  assert.match(board, /const epoch = \+\+loadEpoch\.current/);
  assert.ok((board.match(/if \(epoch !== loadEpoch\.current\) return;/g) ?? []).length >= 2,
    "both identity resolution and parallel case reads must reject stale completions");
  assert.match(board, /auth\.onAuthStateChange\(\(event, session\)/);
  assert.match(board, /if \(event === "TOKEN_REFRESHED"\) return;/);
  assert.match(board, /if \(nextUserId === identityRef\.current\) return;/);
  assert.match(board, /\+\+loadEpoch\.current;[\s\S]*?setCases\(null\);[\s\S]*?setRequests\(\[\]\);[\s\S]*?setEngagements\(\[\]\);[\s\S]*?setIds\(null\);/);
  assert.match(board, /if \(active && nextUserId\) void load\(\)/);
  assert.match(board, /subscription\.unsubscribe\(\)/);
});


// Source-level defense in depth: never submit a stale engagement approval
// after the client account changes; RLS remains the final authority.
test("acceptance verifies current identity and taxpayer before mutation", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  const match = board.match(/async function acceptDraft\(id: string\) \{([\s\S]*?)\n  \}\n\n  async function sendRequest/);
  assert.ok(match, "acceptDraft function must be present");
  const action = match[1];
  assert.match(board, /const acceptInFlight = useRef<string \| null>\(null\)/);
  assert.match(action, /if \(!userId \|\| !taxpayerId \|\| acceptInFlight\.current !== null\) return;/);
  assert.match(action, /acceptInFlight\.current = token;[\s\S]*?await db\.auth\.getUser\(\)/);
  assert.match(action, /auth\.user\?\.id !== userId/);
  assert.match(action, /\.eq\("taxpayer_id", taxpayerId\)/);
  assert.ok((action.match(/epoch !== loadEpoch\.current \|\| userId !== identityRef\.current/g) ?? []).length >= 2,
    "check identity both before the write and after its asynchronous completion");
  assert.match(action, /if \(acceptInFlight\.current === token\)/);
  assert.match(board, /identityRef\.current = nextUserId;[\s\S]*?acceptInFlight\.current = null;/);
  assert.match(board, /active = false;[\s\S]*?acceptInFlight\.current = null;[\s\S]*?subscription\.unsubscribe\(\)/);
});


// A services request is a tenant-scoped message. The selected firm must still
// be authorized when the user sends, not merely when the board first loaded.
// These are source contracts; authenticated multi-firm browser tests remain required.
test("service request revalidates account and selected firm before insert", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  const match = board.match(/async function sendRequest\(\) \{([\s\S]*?)\n  \}\n\n  const filters/);
  assert.ok(match, "sendRequest function must be present");
  const action = match[1];
  assert.match(board, /const sendInFlight = useRef<string \| null>\(null\)/);
  assert.match(action, /if \(sendInFlight\.current !== null\) return;/);
  assert.match(action, /sendInFlight\.current = token;[\s\S]*?await db\.auth\.getUser\(\)/);
  assert.match(action, /auth\.user\?\.id !== userId/);
  assert.match(action, /await resolvePortalContext\(\)/);
  assert.match(action, /context\.status !== "ready"/);
  assert.match(action, /context\.taxpayerId !== target\.taxpayerId/);
  assert.match(action, /context\.organizationId !== target\.organizationId/);
  assert.ok(action.indexOf("await resolvePortalContext()") < action.indexOf('.from("messages").insert('),
    "firm revalidation must happen before message write");
  assert.match(action, /if \(epoch !== loadEpoch\.current \|\| userId !== identityRef\.current\) return;/);
  assert.match(action, /if \(sendInFlight\.current === token\)/);
  assert.match(board, /identityRef\.current = nextUserId;[\s\S]*?sendInFlight\.current = null;/);
  assert.match(board, /active = false;[\s\S]*?sendInFlight\.current = null;[\s\S]*?subscription\.unsubscribe\(\)/);
});


// If any tenant-scoped source fails, the board must not silently render
// incomplete case actions or hide a draft engagement requiring acceptance.
// This is a source-level regression; staging fault injection is still required.
test("services board fails closed when any of its parallel reads fails", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  const start = board.indexOf("const [cs, rq, eng] = await Promise.all([");
  const end = board.indexOf("setOffline(false);", start);
  assert.ok(start !== -1 && end > start, "parallel case, request and engagement reads must exist");
  const loadResult = board.slice(start, end);
  const guard = loadResult.indexOf("if (cs.error || rq.error || eng.error) throw");
  const publish = loadResult.indexOf("setCases((cs.data ?? [])");
  assert.ok(guard >= 0, "any failed tenant read must trigger the offline path");
  assert.ok(publish > guard, "all three read errors must be checked before publishing case data");
  assert.ok(!loadResult.includes("eng.error ? []"),
    "engagement read errors must not be silently replaced with an empty list");
});


// An offline/unauthorized board must not tell a taxpayer that no services
// exist, or open a request form without a current taxpayer/firm context.
// Authenticated FR/EN staging validation is still required.
test("offline or unresolved board never renders a false empty state or enables new requests", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  assert.match(board, /<PrimaryButton disabled=\{!ids \|\| offline \|\| cases === null\} onClick=\{\(\) => setAskOpen\(true\)\}>/);
  assert.match(board, /\) : offline \|\| !ids \? null : visible\.length === 0 \? \(/);
  assert.match(board, /\{offline && <OfflineNote>\{copy\.offline\}<\/OfflineNote>\}/);
});


// A taxpayer may be engaged with two independent firms. The selected firm's
// services board must not display the other firm's cases, requests, or draft
// engagements. These source checks require authenticated staging follow-up.
test("services board scopes every tenant read to selected taxpayer and firm", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  for (const table of ["compliance_cases", "document_requests", "engagements"]) {
    const query = board.split('db.from("' + table + '")')[1]?.split("\n")[0] ?? "";
    assert.ok(query.includes('.eq("taxpayer_id", resolved.taxpayerId)'),
      table + " must retain the verified taxpayer filter");
    assert.ok(query.includes('.eq("organization_id", resolved.organizationId)'),
      table + " must restrict results to the selected authorized firm");
  }
});

test("draft acceptance cannot update an engagement from another selected firm", () => {
  const board = readFileSync("components/client-portal/services-board.tsx", "utf8");
  const action = board.split("async function acceptDraft(id: string) {")[1]?.split("\n  async function sendRequest")[0] ?? "";
  assert.ok(action.includes("const organizationId = ids?.organizationId;"),
    "acceptance must capture the selected verified firm");
  assert.ok(action.includes("!organizationId"),
    "acceptance must refuse an unresolved firm");
  assert.ok(action.includes('.eq("organization_id", organizationId)'),
    "acceptance must constrain the update to the selected firm");
});
