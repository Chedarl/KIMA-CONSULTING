import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function inspect(path) {
  const src = readFileSync(path, "utf8");
  const ast = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tables = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "from" && node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])) {
      tables.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { src, tables };
}
const thread = inspect("components/live/message-thread.tsx");
const detail = inspect("components/live/case-detail.tsx");
for (const [name, file] of [["thread", thread], ["case", detail]]) {
  assert.ok(!file.tables.includes("organizations"),
    name + ": never choose recipient by arbitrary organization lookup");
  assert.ok(file.tables.includes("engagements"),
    name + ": recipient must come from RLS-visible engagement");
}
assert.match(thread.src, /\.eq\("taxpayer_id", taxpayerId\)/);
assert.match(thread.src, /\.in\("status", \["accepted", "authorized"\]\)/);
assert.match(thread.src, /\.is\("revoked_at", null\)/);
assert.match(thread.src, /liveIds\.includes\(current\)/);
assert.match(thread.src, /liveIds\.length === 1 \? liveIds\[0\] : null/);
assert.match(thread.src, /value=\{orgId \?\? ""\}/);
assert.match(thread.src, /firms\.some\(\(firm\) => firm\.id === id\)/);
assert.match(thread.src, /\.rpc\("firm_directory"\)/);
assert.match(thread.src, /visibleMsgs = msgs\.filter\(\(m\) => m\.organization_id === orgId\)/);
assert.match(thread.src, /visibleRequests = requests\.filter\(\(r\) => r\.organization_id === orgId\)/);
assert.match(thread.src, /\.eq\("organization_id", chosenOrg\)/);
assert.match(thread.src, /if \(grantError \|\| !current/);
assert.match(thread.src, /sessionTaxpayerId/);
assert.match(thread.src, /side === "firm" && !firmMemberId/);
assert.match(thread.src, /\.from\("firm_members"\)/);
assert.match(thread.src, /member\?\.organization_id !== chosenOrg/);
assert.match(thread.src, /messageQuery\.eq\("organization_id", firmOrgId\)/);
assert.match(thread.src, /requestQuery\.eq\("organization_id", firmOrgId\)/);
assert.match(thread.src, /engagementQuery\.eq\("organization_id", firmOrgId\)/);
const workspace = inspect("components/live/messages-workspace.tsx");
assert.match(workspace.src, /memberId: session\.memberId/);
assert.ok(!thread.src.includes(".limit(2)"), "do not truncate active firm choices");
const records = inspect("components/live/client-records.tsx");
assert.match(records.src, /sessionTaxpayerId/);
assert.ok(!records.src.includes(".limit(1)"), "records must not pick an arbitrary taxpayer");
assert.match(records.src, /\.eq\("id", taxpayerId\)\.maybeSingle\(\)/);
assert.match(records.src, /\.eq\("taxpayer_id", taxpayerId\)/);
const portal = inspect("lib/supabase.ts");
assert.match(portal.src, /sessionStorage\.getItem\("kima.portal.selectedFirm"\)/);
assert.match(portal.src, /organizationIds\.includes\(choice\.organizationId\)/);
assert.match(portal.src, /choice\?\.taxpayerId === taxpayerId/);
assert.match(portal.src, /engagement\.accepted_at \|\| engagement\.authorized_at/);
const dashboard = inspect("components/live/client-dashboard.tsx");
assert.match(dashboard.src, /\.eq\("organization_id", resolved\.organizationId\)/);
const shell = inspect("components/client-portal/shell.tsx");
assert.match(shell.src, /multipleFirms && !path\.startsWith/);
assert.match(shell.src, /savePortalFirmChoice\(activeId, id\)/);
assert.match(shell.src, /firmOptions\.some\(\(firm\) => firm\.id === id\)/);
assert.ok(shell.src.includes("base}/messages"), "messages must be available with multiple firms");
assert.match(detail.src, /engagement\.id !== row\.engagement_id/);
assert.match(detail.src, /engagement\.taxpayer_id !== row\.taxpayer_id/);
assert.match(detail.src, /engagement\.revoked_at/);
assert.match(detail.src, /organization_id: orgId/);
// Session isolation: stale invitation rows must never survive an account switch.
// This is a source-contract guard, not a substitute for browser acceptance.
const invitations = inspect("components/live/invitations-panel.tsx");
assert.match(invitations.src, /auth\.onAuthStateChange\(/);
assert.match(invitations.src, /const epoch = \+\+loadEpoch\.current;/);
assert.equal((invitations.src.match(/if \(epoch !== loadEpoch\.current\) return;/g) ?? []).length, 3,
  "guard every asynchronous invitation load boundary");
const authChange = invitations.src.split("auth.onAuthStateChange((event, session) => {")[1]?.split("\n    });")[0];
assert.ok(authChange, "auth state changes must invalidate prior session state");
// Token refresh is not an identity change. Keep the pending invitation action
// and selections intact; clear only on sign-out or a different user ID.
assert.ok(authChange.includes('event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED"'),
  "ignore TOKEN_REFRESHED and other non-identity auth events");
assert.ok(authChange.includes("if (nextUserId === identityRef.current) return;"),
  "same-user sign-in must preserve invitation state");
assert.ok(authChange.indexOf("if (nextUserId === identityRef.current) return;") < authChange.indexOf("setInvites([])"),
  "identity comparison must precede clearing invitation rows");
for (const state of ["setUserId(null)", "setTaxpayerId(null)", "setInvites([])",
  "setDrafts([])", "setFirms([])", 'setFirm("")', 'setEngagement("")',
  'setRecipientEmail("")']) {
  assert.ok(authChange.includes(state), "auth change must clear " + state);
}
assert.match(invitations.src, /subscription\.unsubscribe\(\)/);
assert.match(invitations.src, /timer = setTimeout\(\(\) => \{ void load\(\); \}, 0\)/);
// Mutation responses are also asynchronous: a prior account must not update the new account's UI.
assert.match(invitations.src, /const authEpoch = useRef\(0\);/);
assert.ok(authChange.includes("++authEpoch.current"), "auth switch must invalidate mutations");
for (const action of ["decide", "requestFirm", "inviteContact"]) {
  const body = invitations.src.split("  async function " + action + "(")[1]?.split("\n  }")[0];
  assert.ok(body, action + " must exist");
  assert.ok(body.includes("const epoch = authEpoch.current;"), action + " must capture auth identity");
  assert.equal((body.match(/if \(epoch !== authEpoch\.current\) return;/g) ?? []).length, 2,
    action + " must ignore stale RPC results and stale reload completions");
  const rpcIndex = body.indexOf("await supabase().rpc(");
  const firstGuard = body.indexOf("if (epoch !== authEpoch.current) return;");
  const reload = body.indexOf("await load();");
  const secondGuard = body.lastIndexOf("if (epoch !== authEpoch.current) return;");
  assert.ok(rpcIndex >= 0 && rpcIndex < firstGuard && firstGuard < reload && reload < secondGuard,
    action + " must guard both asynchronous boundaries in order");
}
assert.ok((invitations.src.match(/\+\+authEpoch\.current;/g) ?? []).length >= 2,
  "auth epoch must invalidate on account change and unmount");

// Invitation decision controls must fail closed before issuing an RPC.
// The database remains the ultimate recipient and replay authority.
const invitationPanel = inspect("components/live/invitations-panel.tsx");
const invitationDecision = invitationPanel.src.split("async function decide(")[1]?.split("\n  async function requestFirm(")[0] ?? "";
for (const guard of [
  "invites.find((item) => item.id === id)",
  'invitation.status !== "pending"',
  "new Date(invitation.expires_at).getTime() <= Date.now()",
  "invitation.initiated_by !== userId",
  "invitation.recipient_user_id !== userId",
]) {
  assert.ok(invitationDecision.includes(guard), "invitation action guard missing: " + guard);
}
assert.ok(invitationDecision.indexOf('invitation.status !== "pending"') <
  invitationDecision.indexOf('.rpc("decide_invitation"'),
  "check invitation eligibility before the decision RPC");
assert.ok(invitationPanel.src.includes(
  'i.initiated_by === userId ? <button disabled={busy} onClick={() => void decide(i.id,"revoked")}'
), "only the invitation initiator should see the revoke action");


/* Invitation actions must fail closed when the displayed selection belongs
 * to a different taxpayer or has disappeared from the current session's
 * authorized directory. Source assertions complement hosted negative tests. */
assert.match(invitationDecision, /invitation\.taxpayer_id !== taxpayerId/);
assert.match(invitationDecision, /!Number\.isFinite\(new Date\(invitation\.expires_at\)\.getTime\(\)\)/);
assert.ok(invitationDecision.indexOf("invitation.taxpayer_id !== taxpayerId") <
  invitationDecision.indexOf('.rpc("decide_invitation"'),
  "taxpayer scope must be verified before deciding an invitation");
const requestFirmAction = invitations.src.split("async function requestFirm(")[1]?.split("\n  async function inviteContact(")[0] ?? "";
const inviteContactAction = invitations.src.split("async function inviteContact(")[1]?.split("\n  return (")[0] ?? "";
for (const [name, body, required] of [
  ["requestFirm", requestFirmAction, ['side !== "taxpayer"', "!userId", "firms.some((candidate) => candidate.id === firm)"]],
  ["inviteContact", inviteContactAction, ['side !== "firm"', "!userId", "drafts.some((candidate) => candidate.id === engagement)"]],
]) {
  const rpc = body.indexOf("await supabase().rpc(");
  assert.ok(rpc > 0, name + ": invitation RPC must exist");
  for (const guard of required) {
    assert.ok(body.indexOf(guard) >= 0 && body.indexOf(guard) < rpc,
      name + ": " + guard + " must be checked before the RPC");
  }
}
assert.match(invitations.src,
  /disabled=\{busy \|\| !firm \|\| !firms\.some\(\(candidate\) => candidate\.id === firm\)\}/);
assert.match(invitations.src,
  /disabled=\{busy \|\| !engagement \|\| !recipientEmail\.trim\(\) \|\| !drafts\.some\(\(candidate\) => candidate\.id === engagement\)\}/);

// Client compliance/declarations/archive must not retain another account's records.
const recordHook = records.src.split("function useClientRecords() {")[1]?.split("\nfunction requestsByCase(")[0];
assert.ok(recordHook, "client records hook must exist");
assert.match(recordHook, /const epoch = \+\+loadEpoch\.current;/);
assert.equal((recordHook.match(/if \(epoch !== loadEpoch\.current\) return;/g) ?? []).length, 4,
  "guard auth lookup, taxpayer lookup, record queries, and failure handling against stale loads");
assert.match(recordHook, /if \(tp\.error \|\| cs\.error \|\| rq\.error \|\| ev\.error\)/,
  "any failed tenant-scoped query must fail closed");
const recordsAuth = recordHook.split("auth.onAuthStateChange((event, session) => {")[1]?.split("\n    });")[0];
assert.ok(recordsAuth, "client record pages must react to authentication changes");
for (const state of ["++loadEpoch.current", "setRecords(null)", "setOffline(false)"]) {
  assert.ok(recordsAuth.includes(state), "auth change must invalidate " + state);
}
assert.match(recordsAuth, /event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED"/,
  "token refresh and other non-identity events must not reset records");
assert.match(recordsAuth, /if \(nextUserId === identityRef\.current\) return;/);
assert.match(recordsAuth, /setSignedOut\(true\)/);
assert.match(recordsAuth, /setRecords\(EMPTY_RECORDS\)/);
assert.match(recordHook, /timer = setTimeout\(\(\) => \{ void load\(\); \}, 0\)/,
  "re-query after auth callback returns");
assert.match(recordHook, /subscription\.unsubscribe\(\)/,
  "auth subscription must be removed on unmount");
assert.ok((recordHook.match(/\+\+loadEpoch\.current;/g) ?? []).length >= 3,
  "invalidate loads on request start, auth change, and unmount");
assert.match(records.src, /const EMPTY_RECORDS: Records = \{ taxpayer: null, cases: \[\], requests: \[\], events: \[\] \}/);
assert.match(recordHook, /setRecords\(EMPTY_RECORDS\)/,
  "failed queries and sign-out must clear all client record categories");
assert.match(records.src, /signedOut \? \(/,
  "sign-out renders an explicit state rather than the loading skeleton");

const service = inspect("components/live/client-service.tsx");
// A session switch must clear the case and consent before an old request resolves.
assert.match(service.src, /onAuthStateChange\(\(event, session\) =>/);
assert.match(service.src, /\+\+authEpoch\.current/);
assert.match(service.src, /\+\+loadEpoch\.current/);
assert.match(service.src, /setRow\(undefined\)/);
assert.match(service.src, /setClientApproved\(false\)/);
assert.match(service.src, /subscription\.unsubscribe\(\)/);
const serviceLoad = service.src.split("const load = useCallback(async () => {")[1]?.split("\n  useEffect(() => {")[0];
assert.ok(serviceLoad, "client service loader must exist");
assert.ok((serviceLoad.match(/if \(epoch !== loadEpoch\.current\) return;/g) ?? []).length >= 4,
  "all case, engagement and consent fetch boundaries must reject stale loads");
assert.match(serviceLoad, /rq\.error \|\| ev\.error \|\| tp\.error \|\| consent\.error/);

// A route parameter can change before React effects run: render only the loaded case.
// This source-contract test complements, but does not replace, browser route-switch testing.
assert.match(service.src, /const \[loadedCaseId, setLoadedCaseId\] = useState<string \| null>\(null\)/);
assert.match(service.src, /if \(row === undefined \|\| loadedCaseId !== caseId\)/,
  "render must hide the previous case and its approval button on route changes");
assert.match(serviceLoad, /if \(!data\) \{[\s\S]*?setLoadedCaseId\(caseId\);[\s\S]*?return;/,
  "not-found case load must settle the current case identity");
assert.match(serviceLoad, /setRow\(kase\);[\s\S]*?setLoadedCaseId\(caseId\);/,
  "successful case load must record the verified case identity");
assert.match(serviceLoad, /catch \{[\s\S]*?setLoadedCaseId\(caseId\);/,
  "failed case load must settle the current case identity without stale details");
const serviceAuthChange = service.src.split("auth.onAuthStateChange((event, session) => {")[1]?.split("\n    });")[0];
assert.ok(serviceAuthChange?.includes("setLoadedCaseId(null)"),
  "account changes must invalidate the last loaded case identity");

const serviceUpload = service.src.split("async function upload(")[1]?.split("\n  async function approveCase(")[0];
const serviceApproval = service.src.split("async function approveCase(")[1]?.split("\n  // React can reuse")[0];
// Route switches are independent of authentication changes. Both asynchronous
// mutation paths must reject prior-case completions before updating the new case.
assert.match(service.src, /const activeCaseId = useRef\(caseId\)/);
assert.match(service.src, /activeCaseId\.current = caseId/);
assert.match(serviceUpload ?? "", /const actionCaseId = caseId;/);
assert.match(serviceUpload ?? "",
  /if \(epoch !== authEpoch\.current \|\| actionCaseId !== activeCaseId\.current\) return;/);
assert.match(serviceApproval ?? "", /const actionCaseId = caseId;/);
assert.ok((serviceApproval?.match(
  /if \(epoch !== authEpoch\.current \|\| actionCaseId !== activeCaseId\.current\) return;/g,
) ?? []).length >= 2, "approval must reject old sessions and old case routes before and after insert");
assert.match(serviceApproval ?? "",
  /if \(epoch === authEpoch\.current && actionCaseId === activeCaseId\.current\) setFailed/);
assert.match(serviceApproval ?? "",
  /if \(epoch === authEpoch\.current && actionCaseId === activeCaseId\.current\) setBusy/);

// A route switch can happen while the previous case's file picker remains open.
// Reject old-case uploads and approvals at initiation, not only after an await.
// These are source-contract checks; browser race acceptance is still required.
assert.match(serviceUpload ?? "", /if \(loadedCaseId !== caseId \|\| row\.id !== caseId \|\| req\.case_id !== caseId\) return;/,
  "file upload must reject stale route, case and request identities before submission");
assert.match(serviceApproval ?? "", /if \(loadedCaseId !== caseId \|\| row\.id !== caseId\) return;/,
  "client approval must reject a stale route before inserting consent");

// An approval must not be submitted or offered before filing evidence is verified.
// This is a UI contract; database enforcement still requires independent testing.
assert.match(serviceApproval ?? "",
  /if \(row\.filing_status !== "verified" \|\| !row\.filing_evidence_ref\?\.trim\(\)\) return;/,
  "client approval must reject missing or unverified evidence before writing consent");
assert.match(service.src,
  /const hasVerifiedEvidence = row\.filing_status === "verified" && Boolean\(row\.filing_evidence_ref\?\.trim\(\)\)/,
  "approval UI must derive eligibility from verified filing evidence");
assert.match(service.src, /!clientApproved && !hasVerifiedEvidence/,
  "unverified evidence must show a non-approval state");
assert.match(service.src, /!clientApproved && hasVerifiedEvidence && <div className="mt-3">/,
  "approval action must be hidden until verified evidence exists");


// Token refresh must preserve current identity, pending work and visible data.
assert.match(service.src, /event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED"/);
assert.ok(service.src.includes("if (nextUserId === identityRef.current) return;"));


/* Follow-up to the merged session-isolation work: routine reloads must swap
 * rows in place — only an identity change clears them — and a stale or
 * expired invitation click must surface an FR/EN error instead of failing
 * silently. Source-contract assertions; browser acceptance still owed. */
const invitationLoad = invitations.src.split("const load = useCallback(async () => {")[1]?.split("\n  }, [fr, side]);")[0];
assert.ok(invitationLoad, "invitation loader must exist");
const invitationLoadHead = invitationLoad.split("await db.auth.getUser()")[0];
for (const cleared of ["setInvites([])", "setDrafts([])", "setFirms([])"]) {
  assert.ok(!invitationLoadHead.includes(cleared),
    "routine reloads must not blank " + cleared + " before refetch");
}
assert.ok(invitationLoad.includes('setError(fr ? "Invitations indisponibles." : "Invitations unavailable.")'),
  "load failures must still surface an error");
assert.ok(invitationDecision.includes("Invitation indisponible ou expirée."),
  "stale or expired invitation clicks must surface a French error");
assert.ok(invitationDecision.includes("Invitation unavailable or expired."),
  "stale or expired invitation clicks must surface an English error");
assert.ok(invitationDecision.includes("void load();"),
  "stale invitation clicks must refresh the list so the dead row disappears");
assert.ok(invitationDecision.indexOf("Invitation unavailable or expired.") <
  invitationDecision.indexOf('.rpc("decide_invitation"'),
  "stale-click feedback must precede the decision RPC");

console.log("ok: live engagement recipient selector and case-scoped tenant routing");
