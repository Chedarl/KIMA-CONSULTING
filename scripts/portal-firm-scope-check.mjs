import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { runInNewContext } from "node:vm";

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
// The thread itself must bind a supplied OTP member to the current Auth user
// on both read and send. Parent workspace checks alone cannot protect a
// separately mounted thread or a stale member identity.
const firmThreadLoad = thread.src.split("  const load = useCallback(async () => {")[1]?.split("\n  useEffect(() => {")[0] ?? "";
const firmThreadSend = thread.src.split("  async function send(")[1]?.split("\n  if (!taxpayerId) return")[0] ?? "";
// Realtime events must not keep a previous tenant/grant snapshot visible while
// the authenticated thread loader rechecks membership and active engagements.
// Keep the firm selection across a successful refresh; only hide message data.
const hideMessages = firmThreadLoad.indexOf("setMsgs(null);");
const hideRequests = firmThreadLoad.indexOf("setRequests([]);");
const verifyAuth = firmThreadLoad.indexOf("const db = supabase();");
const generationStart = firmThreadLoad.indexOf("const generation = ++loadGeneration.current;");
assert.ok(generationStart >= 0 && generationStart < hideMessages &&
  hideMessages < verifyAuth && hideRequests > generationStart && hideRequests < verifyAuth,
  "thread reload must hide old messages and requests before rechecking Auth/grants");
assert.ok(!firmThreadLoad.slice(generationStart, verifyAuth).includes("setOrgId(null)"),
  "refresh must preserve the selected firm until the authorized grant response");
for (const [operation, body] of [["read", firmThreadLoad], ["send", firmThreadSend]]) {
  assert.ok(body, "firm thread " + operation + " must exist");
  const auth = body.indexOf("await db.auth.getUser()");
  const member = body.indexOf('.from("firm_members")');
  const binding = body.indexOf('.eq("auth_user_id", user.id)');
  assert.ok(auth >= 0 && auth < member && member < binding,
    "firm thread " + operation + " must authenticate before binding the member");
  assert.ok(body.includes('if (authError || !user) throw'),
    "firm thread " + operation + " must fail closed when authentication is unavailable");
  assert.ok(body.includes('.eq("active", true)') && body.includes('.is("deactivated_at", null)'),
    "firm thread " + operation + " must require an active member");
}
assert.ok(firmThreadLoad.indexOf('.eq("auth_user_id", user.id)') <
  firmThreadLoad.indexOf('const messageQuery'),
  "member identity must be verified before reading thread data");
assert.ok(firmThreadSend.indexOf('.eq("auth_user_id", user.id)') <
  firmThreadSend.indexOf('.from("messages").insert(optimistic)'),
  "member identity must be verified before sending a message");
// The taxpayer thread must independently revalidate its mounted taxpayer
// against the current authenticated portal session before reading or sending.
// The parent wrapper alone cannot protect a stale async operation or a direct
// MessageThread mount. Database RLS remains the final authorization boundary.
for (const [operation, body, protectedRead] of [
  ["read", firmThreadLoad, 'const messageQuery = db.from("messages")'],
  ["send", firmThreadSend, '.from("messages").insert(optimistic)'],
]) {
  const guard = body.indexOf('side === "taxpayer" && (await sessionTaxpayerId()) !== taxpayerId');
  const query = body.indexOf(protectedRead);
  assert.ok(guard >= 0 && query > guard,
    "taxpayer thread " + operation + " must revalidate its Auth-bound taxpayer before message access");
  assert.ok(body.includes('throw new Error("Taxpayer session unavailable")'),
    "taxpayer thread " + operation + " must fail closed for a stale taxpayer session");
}
const workspace = inspect("components/live/messages-workspace.tsx");
assert.match(workspace.src, /memberId: session\.memberId/);
// Firm inbox must resolve its OTP member against the authenticated user and
// only load authorized engagements, taxpayer names, and messages for that firm.
// These source contracts supplement, not replace, two-firm browser/RLS tests.
assert.match(workspace.src, /db\.auth\.getUser\(\)/);
assert.match(workspace.src, /\.from\("firm_members"\)[\s\S]*?\.eq\("id", session\.memberId\)[\s\S]*?\.eq\("auth_user_id", user\.id\)[\s\S]*?\.eq\("active", true\)[\s\S]*?\.is\("deactivated_at", null\)/);
assert.match(workspace.src, /\.from\("engagements"\)[\s\S]*?\.eq\("organization_id", firmOrgId\)[\s\S]*?\.is\("revoked_at", null\)/);
assert.match(workspace.src, /\.from\("taxpayers"\)[\s\S]*?\.in\("id", taxpayerIds\)/);
assert.match(workspace.src, /\.from\("messages"\)[\s\S]*?\.eq\("organization_id", firmOrgId\)[\s\S]*?\.in\("taxpayer_id", taxpayerIds\)/);
assert.match(workspace.src, /if \(row\.organization_id !== firmOrgId \|\| !allowedTaxpayers\.has\(row\.taxpayer_id\)\) return;/);
assert.match(workspace.src, /if \(engagementsError\) throw/);
assert.match(workspace.src, /if \(taxpayersError \|\| messagesError\) throw/);
assert.match(workspace.src, /if \(offline\) return/);
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
// Account switches must clear all previously resolved taxpayer and firm UI
// immediately, and invalidate in-flight shell directory/case lookups.
assert.match(shell.src, /const authEpoch = useRef\(0\)/);
assert.match(shell.src, /auth\.onAuthStateChange\(\(event, session\) =>/);
const shellAuth = shell.src.split("auth.onAuthStateChange((event, session) => {")[1]?.split("\n    });")[0];
assert.ok(shellAuth, "client shell must observe auth changes");
assert.ok(shellAuth.includes("if (nextUserId === authIdentity.current) return;"),
  "same-user token refresh must preserve the selected firm");
for (const state of ["++authEpoch.current", "setBiz([])", "setActiveId(null)",
  "setMultipleFirms(undefined)", "setFirmOptions([])", 'setSelectedFirmId("")',
  "setUnread(0)", "catalogue.current = []", 'setQuery("")']) {
  assert.ok(shellAuth.includes(state), "auth change must clear " + state);
}
assert.match(shell.src, /if \(cancelled \|\| epoch !== authEpoch\.current\) return;/);
assert.ok((shell.src.match(/if \(cancelled \|\| epoch !== authEpoch\.current\) return;/g) ?? []).length >= 4,
  "all asynchronous shell reads must reject prior-account completions");
assert.match(shell.src, /subscription\.unsubscribe\(\)/);
assert.match(shell.src, /copy\.nav\.requests, locale, identityVersion\]/);
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
assert.equal((invitations.src.match(/if \(epoch !== loadEpoch\.current\) return;/g) ?? []).length, 4,
  "guard Auth, taxpayer, firm-membership and tenant-query load boundaries");
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
  assert.ok((body.match(/if \(epoch !== authEpoch\.current\) return;/g) ?? []).length >= 2,
    action + " must ignore stale RPC results and stale reload completions");
  const rpcIndex = Math.max(body.indexOf("await supabase().rpc("), body.indexOf("await db.rpc("));
  const firstGuard = body.indexOf("if (epoch !== authEpoch.current) return;", rpcIndex);
  const reload = body.indexOf("await load();", rpcIndex);
  const secondGuard = body.indexOf("if (epoch !== authEpoch.current) return;", reload);
  assert.ok(rpcIndex >= 0 && rpcIndex < firstGuard && firstGuard < reload && reload < secondGuard,
    action + " must guard both asynchronous post-RPC boundaries in order");
  if (action === "decide") {
    assert.ok(body.indexOf("if (epoch !== authEpoch.current) return;") < rpcIndex,
      "decision must also invalidate pre-RPC live authorization reads");
  }
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
  const rpc = Math.max(body.indexOf("await supabase().rpc("), body.indexOf("await db.rpc("));
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
assert.match(service.src, /if \(caseStamp !== caseId\) \{\n    setCaseStamp\(caseId\);\n    setBusy\(null\);\n    setFailed\(null\);\n    pending\.current = null;\n    uploadInFlight\.current = null;\n    approvalInFlight\.current = null;\n  \}/,
  "switching cases must clear approval busy, failure, and pending state before paint");

// A route switch can happen while the previous case's file picker remains open.
// Reject old-case uploads and approvals at initiation, not only after an await.
// These are source-contract checks; browser race acceptance is still required.
assert.match(serviceUpload ?? "", /if \(loadedCaseId !== caseId \|\| row\.id !== caseId \|\| req\.case_id !== caseId\) return;/,
  "file upload must reject stale route, case and request identities before submission");
assert.match(serviceApproval ?? "", /if \(loadedCaseId !== caseId \|\| row\.id !== caseId\) return;/,
  "client approval must reject a stale route before inserting consent");

// A stale document-request button must not upload a file after the user's
// taxpayer, firm engagement, case or request grant changes. These are
// source-contract guards, not authenticated storage/RLS acceptance tests.
const uploadAuthRead = serviceUpload?.indexOf("await db.auth.getUser()") ?? -1;
const uploadTaxpayerRead = serviceUpload?.indexOf("await sessionTaxpayerId()") ?? -1;
const uploadCaseRead = serviceUpload?.indexOf('.from("compliance_cases")') ?? -1;
const uploadGrantRead = serviceUpload?.indexOf('.from("engagements")') ?? -1;
const uploadRequestRead = serviceUpload?.indexOf('.from("document_requests")') ?? -1;
const uploadStorageWrite = serviceUpload?.indexOf("await submitRequestFile(") ?? -1;
assert.ok(uploadAuthRead >= 0 && uploadTaxpayerRead > uploadAuthRead &&
  uploadCaseRead > uploadTaxpayerRead && uploadGrantRead > uploadCaseRead &&
  uploadRequestRead > uploadGrantRead && uploadStorageWrite > uploadRequestRead,
  "document upload must revalidate live Auth, taxpayer, case, engagement and request before storage");
for (const guard of [
  "auth.user.id !== identityRef.current",
  "liveTaxpayerId !== ids.taxpayerId",
  "liveCase.engagement_id !== row.engagement_id",
  "liveGrant.organization_id !== ids.organizationId",
  "liveGrant.taxpayer_id !== ids.taxpayerId",
  "liveGrant.revoked_at",
  '["accepted", "authorized"].includes(liveGrant.status)',
  "liveRequest.case_id !== actionCaseId",
  "liveRequest.taxpayer_id !== ids.taxpayerId",
  "liveRequest.organization_id !== ids.organizationId",
  "liveRequest.status !== req.status",
  "waitsOn(liveRequest) !== \"client\"",
]) {
  assert.ok(serviceUpload?.includes(guard), "document upload missing live grant guard: " + guard);
}
assert.ok((serviceUpload?.match(/epoch !== authEpoch\.current \|\| actionCaseId !== activeCaseId\.current/g) ?? []).length >= 4,
  "document upload must reject stale auth and route after asynchronous reads");
assert.ok(serviceUpload?.includes("if (epoch === authEpoch.current && actionCaseId === activeCaseId.current) setFailed(requestId);"),
  "refused live upload authorization must surface an error only on the originating session/case");

// File picker changes can fire twice before React renders busy state. An
// upload lock must be acquired synchronously, survive awaits, and be released
// only by its originating request. Auth and route switches must invalidate it.
assert.match(service.src,
  /const uploadInFlight = useRef<\{ caseId: string; epoch: number; requestId: string \} \| null>\(null\)/);
const uploadLockGuard = serviceUpload.indexOf("if (uploadInFlight.current) return;");
const uploadLockAcquire = serviceUpload.indexOf("uploadInFlight.current = action;");
const uploadAuthStart = serviceUpload.indexOf("await db.auth.getUser()");
assert.ok(uploadLockGuard >= 0 && uploadLockAcquire > uploadLockGuard &&
  uploadAuthStart > uploadLockAcquire,
  "upload must acquire a synchronous single-flight lock before authorization reads");
assert.ok(serviceUpload.indexOf("try {") < serviceUpload.indexOf("const db = supabase();"),
  "upload must initialize Supabase inside try to release lock on synchronous failure");
assert.ok(serviceUpload.includes("if (uploadInFlight.current === action) uploadInFlight.current = null;"),
  "only the originating upload may release its lock");
assert.match(service.src, /if \(caseStamp !== caseId\) \{[\s\S]*?uploadInFlight\.current = null;/,
  "case changes must clear an old upload lock");
assert.ok(serviceAuthChange?.includes("uploadInFlight.current = null;"),
  "account changes must clear an old upload lock");
assert.match(service.src, /return \(\) => \{[\s\S]*?uploadInFlight\.current = null;[\s\S]*?subscription\.unsubscribe\(\);/,
  "unmount must invalidate the pending upload lock");

// React busy state is asynchronous: two rapid clicks can enter the approval
// handler before a re-render. A synchronous, per-component lock must serialize
// consent attempts, and an older completion must not release a newer attempt.
assert.match(service.src,
  /const approvalInFlight = useRef<\{ caseId: string; epoch: number \} \| null>\(null\)/);
const approvalLockGuard = serviceApproval.indexOf("if (approvalInFlight.current) return;");
const approvalLockAcquire = serviceApproval.indexOf("approvalInFlight.current = action;");
const approvalAuthRead = serviceApproval.indexOf("await db.auth.getUser()");
assert.ok(approvalLockGuard >= 0 && approvalLockAcquire > approvalLockGuard &&
  approvalAuthRead > approvalLockAcquire,
  "approval must synchronously acquire its lock before any asynchronous authorization read");
assert.ok(serviceApproval.indexOf("try {") < serviceApproval.indexOf("const db = supabase();"),
  "client approval must initialize Supabase inside try so a synchronous failure releases the lock");
assert.ok(serviceApproval.includes("if (approvalInFlight.current === action) approvalInFlight.current = null;"),
  "only the originating approval attempt may release its lock");
assert.match(service.src, /if \(caseStamp !== caseId\) \{[\s\S]*?approvalInFlight\.current = null;/,
  "case switches must reset the previous case approval lock");
assert.ok(serviceAuthChange?.includes("approvalInFlight.current = null;"),
  "authenticated identity changes must reset the previous approval lock");

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

// A case can be revoked, advanced or have its evidence replaced after render.
// Re-read live RLS-scoped case and taxpayer immediately before writing consent.
// This remains a UI contract; DB enforcement and authenticated staging tests are required.
assert.ok(serviceApproval.includes("auth.user.id !== identityRef.current"),
  "client consent must reject a switched authenticated identity");
const approvalTaxpayerRead = serviceApproval.indexOf("await sessionTaxpayerId()");
const approvalCaseRead = serviceApproval.indexOf('.from("compliance_cases")');
const approvalInsert = serviceApproval.indexOf('.from("case_client_approvals").insert(');
assert.ok(approvalTaxpayerRead >= 0 && approvalCaseRead > approvalTaxpayerRead &&
  approvalInsert > approvalCaseRead, "client consent must revalidate taxpayer and case before insert");
assert.ok(serviceApproval.includes("liveTaxpayerId !== ids.taxpayerId"),
  "client consent must reject a switched taxpayer context");
for (const guard of [
  'liveCase.taxpayer_id !== ids.taxpayerId',
  'liveCase.organization_id !== ids.organizationId',
  'liveCase.engagement_id !== row.engagement_id',
  'liveCase.stage !== "client_approval"',
  'liveCase.approval_round !== row.approval_round',
  'liveCase.filing_status !== "verified"',
  'liveCase.filing_evidence_ref !== row.filing_evidence_ref',
]) {
  assert.ok(serviceApproval.includes(guard), "live consent case guard missing: " + guard);
}
assert.ok(serviceApproval.indexOf("if (liveCaseError || !liveCase") < approvalInsert,
  "failed or absent live case must prevent client consent");
const approvalGrantRead = serviceApproval.indexOf('.from("engagements")');
assert.ok(approvalGrantRead > approvalCaseRead && approvalGrantRead < approvalInsert,
  "client consent must recheck the live engagement before inserting");
for (const guard of [
  'liveGrant.organization_id !== ids.organizationId',
  'liveGrant.taxpayer_id !== ids.taxpayerId',
  'liveGrant.revoked_at',
  '["accepted", "authorized"].includes(liveGrant.status)',
]) {
  assert.ok(serviceApproval.includes(guard), "live consent engagement guard missing: " + guard);
}

assert.ok((serviceApproval.match(/if \(epoch !== authEpoch\.current \|\| actionCaseId !== activeCaseId\.current\) return;/g) ?? []).length >= 4,
  "live taxpayer and case reads must preserve account/route race guards");



// Token refresh must preserve current identity, pending work and visible data.
assert.match(service.src, /event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED"/);
assert.ok(service.src.includes("if (nextUserId === identityRef.current) return;"));


/* Follow-up to the merged session-isolation work: routine reloads must swap
 * rows in place — only an identity change clears them — and a stale or
 * expired invitation click must surface an FR/EN error instead of failing
 * silently. Source-contract assertions; browser acceptance still owed. */
const invitationLoad = invitations.src.split("const load = useCallback(async (options?: { keepError?: boolean }) => {")[1]?.split("\n  }, [fr, side]);")[0];
assert.ok(invitationLoad, "invitation loader must exist");
const invitationLoadHead = invitationLoad.split("await db.auth.getUser()")[0];
for (const cleared of ["setInvites([])", "setDrafts([])", "setFirms([])"]) {
  assert.ok(!invitationLoadHead.includes(cleared),
    "routine reloads must not blank " + cleared + " before refetch");
}
assert.ok(invitationLoad.includes('setError(fr ? "Invitations indisponibles." : "Invitations unavailable.")'),
  "load failures must still surface an error");
assert.ok(invitationLoad.includes('if (!options?.keepError) setError("");'),
  "a kept error must survive the successful reload");
assert.ok(invitationDecision.includes("Invitation indisponible ou expirée."),
  "stale or expired invitation clicks must surface a French error");
assert.ok(invitationDecision.includes("Invitation unavailable or expired."),
  "stale or expired invitation clicks must surface an English error");
assert.ok(!invitationDecision.includes("La liste a été actualisée"),
  "copy must not claim the expired row was removed");
assert.ok(!invitationDecision.includes("The list has been refreshed"),
  "copy must not claim the expired row was removed");
assert.ok(invitationDecision.includes("void load({ keepError: true });"),
  "stale invitation clicks refresh the list without clearing the error");
assert.ok(invitationDecision.indexOf("Invitation unavailable or expired.") <
  invitationDecision.indexOf('.rpc("decide_invitation"'),
  "stale-click feedback must precede the decision RPC");


// Before accepting, declining or revoking an invitation, refresh the
// authenticated caller and invitation row. A cached button is not proof that
// the recipient, status, expiry or tenant is still authorized.
const liveDecision = invitationDecision.split("const db = supabase();")[1]?.split(
  '.rpc("decide_invitation"'
)[0] ?? "";
assert.ok(liveDecision.includes("await db.auth.getUser()"),
  "decision must verify the live authenticated user");
assert.ok(liveDecision.includes('.from("engagement_invitations")') &&
  liveDecision.includes('.eq("id", id).maybeSingle()'),
  "decision must fetch the current invitation before RPC");
for (const check of [
  "liveAuth.user.id !== userId",
  "liveInvite.organization_id !== invitation.organization_id",
  "liveInvite.taxpayer_id !== invitation.taxpayer_id",
  "liveInvite.initiated_by !== invitation.initiated_by",
  "liveInvite.recipient_user_id !== invitation.recipient_user_id",
  'liveInvite.status !== "pending"',
  "liveInvite.initiated_by !== userId",
  "liveInvite.recipient_user_id !== userId",
  "liveInvite.taxpayer_id !== taxpayerId",
  "epoch !== authEpoch.current",
]) {
  assert.ok(liveDecision.includes(check), "live invitation decision missing: " + check);
}
assert.ok(liveDecision.includes("await load({ keepError: true })"),
  "stale or unauthorized invitation must refresh without issuing a decision");

// A firm-side invitation must revalidate the current Auth identity, selected
// draft engagement and active firm membership before sending a recipient email.
// A stale cached draft from another account or revoked firm must not trigger RPC.
// Source-contract regression; authenticated RLS/negative staging tests still owed.
const liveContact = inviteContactAction.split("const db = supabase();")[1]?.split(
  '.rpc("create_invitation_for_contact"'
)[0] ?? "";
assert.ok(liveContact.includes("await db.auth.getUser()"),
  "firm invitation must refresh authenticated identity before RPC");
assert.ok(liveContact.includes('.from("engagements")') &&
  liveContact.includes('.eq("id", engagement).maybeSingle()'),
  "firm invitation must fetch selected live engagement before RPC");
assert.ok(liveContact.includes('.from("firm_members")'),
  "firm invitation must verify active firm membership before RPC");
for (const check of [
  "liveAuth.user.id !== userId",
  "liveDraft.taxpayer_id !== selectedDraft.taxpayer_id",
  "liveDraft.revoked_at",
  'liveDraft.status !== "draft" && liveDraft.status !== "invited"',
  '.eq("organization_id", liveDraft.organization_id)',
  '.eq("auth_user_id", userId)',
  '.eq("active", true)',
  '.is("deactivated_at", null)',
  "epoch !== authEpoch.current",
  "await load({ keepError: true })",
]) {
  assert.ok(liveContact.includes(check), "firm invitation live guard missing: " + check);
}
assert.ok(inviteContactAction.indexOf("await db.auth.getUser()") <
  inviteContactAction.indexOf('.rpc("create_invitation_for_contact"'),
  "live auth and engagement checks must precede invitation creation");

// A taxpayer-side request must not rely on a cached taxpayer session or
// directory choice after an account switch or firm directory change.
// This is a source-contract check; RLS/RPC and authenticated staging negative
// tests remain the final authorization and replay gates.
const liveRequest = requestFirmAction.split("const db = supabase();")[1]?.split(
  '.rpc("create_invitation"'
)[0] ?? "";
assert.ok(liveRequest.includes("await db.auth.getUser()"),
  "taxpayer firm request must verify current Auth identity");
assert.ok(liveRequest.includes("await sessionTaxpayerId()"),
  "taxpayer firm request must verify current RLS-visible taxpayer");
assert.ok(liveRequest.includes('await db.rpc("firm_directory")'),
  "taxpayer firm request must recheck the live firm directory");
for (const check of [
  "liveAuth.user.id !== userId",
  "liveTaxpayerId !== requestedTaxpayer",
  "!Array.isArray(liveDirectory)",
  "liveDirectory.some((candidate) => candidate.id === requestedFirm)",
  "epoch !== authEpoch.current",
  "setInvites([])",
  "setFirms([])",
  'setFirm("")',
  "await load({ keepError: true })",
]) {
  assert.ok(liveRequest.includes(check), "taxpayer firm request guard missing: " + check);
}
assert.ok(requestFirmAction.indexOf("await db.auth.getUser()") <
  requestFirmAction.indexOf('.rpc("create_invitation"'),
  "live taxpayer and firm checks must precede invitation RPC");
assert.ok(requestFirmAction.includes("p_organization_id: requestedFirm") &&
  requestFirmAction.includes("p_taxpayer_id: requestedTaxpayer"),
  "request RPC must use the exact prevalidated tenant and firm selection");

// A failed invitation, firm-directory or draft-engagement read must never
// retain the previous authorized snapshot or pretend no pending drafts exist.
// This source contract complements authenticated fault-injection in staging.
const invitationReadFailure = invitationLoad.split("if (rows.error ||")[1]?.split("\n    setInvites((rows.data")[0] ?? "";
assert.ok(invitationReadFailure.includes('side === "firm" && "error" in engagements && engagements.error'),
  "firm draft-engagement read errors must fail closed");
for (const cleared of ["setInvites([])", "setFirms([])", "setDrafts([])",
  'setFirm("")', 'setEngagement("")']) {
  assert.ok(invitationReadFailure.includes(cleared),
    "failed invitation refresh must clear stale " + cleared);
}
assert.ok(invitationReadFailure.indexOf("setInvites([])") < invitationReadFailure.indexOf("setError("),
  "hide stale invitations before reporting a tenant read failure");

// A taxpayer may have multiple active accounting firms. The shell's search
// catalogue and unread badge must use the selected, verified firm as well as
// the taxpayer; otherwise one firm's cases/messages appear in another view.
// These source assertions supplement authenticated two-firm staging tests.
const shellContextReads = shell.src.split("const context = await resolvePortalContext();")[1]?.split("\n      } catch {")[0] ?? "";
assert.ok(shellContextReads, "client shell context reads must exist");
for (const table of ["compliance_cases", "document_requests"]) {
  const read = shellContextReads.split('db.from("' + table + '")')[1]?.split("\n")[0] ?? "";
  assert.ok(read.includes('.eq("taxpayer_id", ids.taxpayerId)') &&
    read.includes('.eq("organization_id", ids.organizationId)'),
    table + " must scope shell search to the selected firm and taxpayer");
}
const unreadRead = shellContextReads.split('.from("messages")')[1]?.split('.is("read_at", null)')[0] ?? "";
assert.ok(unreadRead.includes('.eq("taxpayer_id", tid)') &&
  unreadRead.includes('.eq("organization_id", ids.organizationId)'),
  "unread badge must be scoped to the selected firm and taxpayer");

console.log("ok: live engagement recipient selector and case-scoped tenant routing");


// The shell must not publish a partial tenant snapshot if any taxpayer,
// unread-message, case or request query fails. This is a source contract;
// authenticated fault-injection in staging remains a separate release gate.
const shellReads = shell.src.split("const { data, error: taxpayerError } = await db.from(\"taxpayers\")")[1]?.split("\n      } catch {")[0] ?? "";
assert.ok(shellReads, "taxpayer query must expose its error");
assert.ok(shellReads.includes("if (taxpayerError) throw taxpayerError;"),
  "a failed taxpayer lookup must not become an empty account");
assert.ok(shellReads.includes("error: unreadError") && shellReads.includes("if (unreadError) throw unreadError;"),
  "a failed unread count must not become zero");
assert.ok(shellReads.includes("if (cases.error || requests.error) throw cases.error ?? requests.error;"),
  "a failed case or request read must not produce an incomplete search catalogue");
const shellPublish = shellReads.indexOf("setBiz((data ?? []) as Business[]);");
assert.ok(shellPublish > shellReads.indexOf("if (cases.error || requests.error) throw"),
  "publish taxpayer identity only after all tenant reads succeed");
assert.ok(shellReads.indexOf("setUnread(count ?? 0);") > shellReads.indexOf("if (cases.error || requests.error) throw"),
  "publish unread badge only after all tenant reads succeed");
const shellFailure = shell.src.split("\n      } catch {")[1]?.split("\n      }\n    })();")[0] ?? "";
for (const cleared of ["setBiz([])", "setActiveId(null)", 'setSelectedFirmId("")',
  "setUnread(0)", "catalogue.current = []"]) {
  assert.ok(shellFailure.includes(cleared), "failed tenant reads must clear " + cleared);
}

// A tenant-scoped search catalogue is populated and cleared asynchronously.
// Recompute hits from the current catalogue on each render: memoizing only by
// query would retain old firm/case hits after a failed read or context reload.
// Authenticated browser switching remains a separate staging release gate.
const shellSearchResults = shell.src.split("const results = ")[1]?.split("\n\n  function active(")[0] ?? "";
assert.ok(shellSearchResults.startsWith("(() => {"),
  "shell search results must read the live catalogue on every render");
assert.ok(shellSearchResults.includes("catalogue.current.filter("),
  "search must filter the current tenant-scoped catalogue");
assert.ok(!shellSearchResults.includes("[query]"),
  "query-only memoization must not retain hits from an earlier firm snapshot");


// The taxpayer message wrapper must unmount a previous account's thread as
// soon as the authenticated identity changes. This is a source contract;
// authenticated two-taxpayer browser switching is still a staging gate.
const clientMessageWrapper = thread.src.split("export function ClientMessageThread(")[1]?.split("\nexport function MessageThread(")[0] ?? "";
assert.ok(clientMessageWrapper, "taxpayer message entry point must exist");
assert.match(clientMessageWrapper, /const authEpoch = useRef\(0\)/);
assert.match(clientMessageWrapper, /auth\.onAuthStateChange\(\(event, session\) =>/);
const messageAuthChange = clientMessageWrapper.split("auth.onAuthStateChange((event, session) => {")[1]?.split("\n    });")[0] ?? "";
assert.ok(messageAuthChange, "taxpayer message entry point must subscribe to auth");
for (const event of ['"SIGNED_OUT"', '"SIGNED_IN"', '"USER_UPDATED"', '"INITIAL_SESSION"']) {
  assert.ok(messageAuthChange.includes(event), "message wrapper must handle " + event);
}
assert.ok(messageAuthChange.includes("if (nextUserId === identityRef.current) return;"),
  "same-user token refresh and sign-in must preserve the thread");
assert.ok(messageAuthChange.indexOf("if (nextUserId === identityRef.current) return;") <
  messageAuthChange.indexOf("setTid(null)"),
  "compare identity before clearing taxpayer messages");
for (const guard of ["const epoch = ++authEpoch.current;", "setTid(null)", "setResolved(!nextUserId)"]) {
  assert.ok(messageAuthChange.includes(guard), "account change must invalidate " + guard);
}
assert.ok(messageAuthChange.includes("timer = setTimeout(() => {"),
  "resolve taxpayer outside Supabase auth callback");
assert.ok(clientMessageWrapper.includes("await sessionTaxpayerId()"),
  "new message thread must revalidate taxpayer for the new session");
assert.ok(clientMessageWrapper.includes("if (!active || epoch !== authEpoch.current) return;"),
  "old account taxpayer lookup must not restore its thread");
assert.ok(clientMessageWrapper.includes("++authEpoch.current;") &&
  clientMessageWrapper.includes("subscription.unsubscribe();"),
  "unmount must invalidate pending taxpayer reads and unsubscribe");
assert.match(clientMessageWrapper, /key=\{\`\$\{identityRef\.current \?\? "none"\}:\$\{tid\}\`\}/,
  "message thread must remount across identities even if taxpayer ID is shared");


// Firm messaging is mounted only for the current OTP member. Reusing the
// previous member's preview list or open thread across a session switch can
// disclose another firm's conversation before asynchronous reads finish.
// This source contract supplements authenticated two-firm browser acceptance.
const firmMessages = inspect("components/live/messages-workspace.tsx").src;
const firmMessagesEntry = firmMessages.split("export function MessagesWorkspace(")[1]?.split("\nfunction FirmMessagesView(")[0] ?? "";
const firmMessagesView = firmMessages.split("\nfunction FirmMessagesView(")[1] ?? "";
assert.ok(firmMessagesEntry && firmMessagesView,
  "firm messaging must separate the session boundary from the data-bearing view");
assert.ok(firmMessagesEntry.includes("subscribeFirmSession(setSession)"),
  "firm session changes must update the parent boundary");
assert.ok(firmMessagesEntry.includes("if (!session) return"),
  "signed-out users must not retain firm message previews");
assert.ok(firmMessagesEntry.includes('key={`${session.memberId}:${session.signedInAt}`}'),
  "new OTP sessions must remount previews and open threads even for the same member");
assert.ok(firmMessagesEntry.includes("session={session}"),
  "the child view must receive only the current firm session");
assert.ok(firmMessagesView.includes('db.from("taxpayers")') &&
  firmMessagesView.includes('.from("messages")'),
  "all firm message data reads must live inside the session-keyed child");
assert.ok(!firmMessagesView.includes("subscribeFirmSession("),
  "data-bearing child must not own an independent stale session subscription");


// A mounted firm inbox must revalidate membership and engagement grants after
// returning to the tab and on a bounded interval. A one-time authorized-set
// snapshot must not remain visible indefinitely after access is revoked.
// These source-contract checks do not replace authenticated revocation tests.
const firmRefresh = workspace.src.split("function FirmMessagesView(")[1]?.split("  const sorted = useMemo(")[0] ?? "";
assert.ok(firmRefresh, "firm inbox view must exist");
assert.match(firmRefresh, /const \[refreshEpoch, setRefreshEpoch\] = useState\(0\)/);
assert.match(firmRefresh, /window\.setInterval\(refreshAccess, 60_000\)/,
  "mounted inbox must revalidate access periodically");
assert.match(firmRefresh, /window\.addEventListener\("focus", refreshAccess\)/,
  "returning to the browser must revalidate firm access");
assert.match(firmRefresh, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/,
  "returning to a background tab must revalidate firm access");
assert.match(firmRefresh, /document\.visibilityState === "visible"/);
const refreshBody = firmRefresh.split("const refreshAccess = () => {")[1]?.split("\n    };")[0] ?? "";
for (const clear of ["setClients(null)", "setPreviews({})", "setActive(null)",
  "setAssignments([])", "setRefreshEpoch((epoch) => epoch + 1)"]) {
  assert.ok(refreshBody.includes(clear), "access refresh must invalidate " + clear);
}
assert.match(firmRefresh, /}, \[session\.memberId, refreshEpoch\]\);/,
  "every access refresh must re-run Auth, member, and engagement checks");
assert.match(firmRefresh, /window\.clearInterval\(timer\)/);
assert.match(firmRefresh, /window\.removeEventListener\("focus", refreshAccess\)/);
assert.match(firmRefresh, /document\.removeEventListener\("visibilitychange", onVisibilityChange\)/);


// A client thread must not keep a revoked firm's conversation mounted forever.
// Recheck current Auth and active engagement grants when the browser resumes
// and periodically, clearing the previous snapshot before each request.
// Source contracts are supplemental to authenticated revocation/RLS testing.
const clientRefresh = thread.src.split("  // Revalidate client message access")[1]?.split("  // A unique channel name per mount")[0] ?? "";
assert.ok(clientRefresh, "client thread must revalidate mounted access");
assert.match(clientRefresh, /side !== "taxpayer"/);
assert.match(clientRefresh, /window\.setInterval\(refreshClientAccess, 60_000\)/);
assert.match(clientRefresh, /window\.addEventListener\("focus", refreshClientAccess\)/);
assert.match(clientRefresh, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
assert.match(clientRefresh, /document\.visibilityState === "visible"/);
for (const clear of ["setMsgs(null)", "setRequests([])", "setFirms([])", "setOrgId(null)"]) {
  assert.ok(clientRefresh.includes(clear), "client refresh must clear " + clear);
}
assert.match(clientRefresh, /void load\(\)/);
assert.match(clientRefresh, /window\.clearInterval\(timer\)/);
assert.match(clientRefresh, /window\.removeEventListener\("focus", refreshClientAccess\)/);
assert.match(clientRefresh, /document\.removeEventListener\("visibilitychange", onVisibilityChange\)/);
assert.match(thread.src, /const loadGeneration = useRef\(0\)/);
assert.match(firmThreadLoad, /const generation = \+\+loadGeneration\.current/);
assert.match(firmThreadLoad, /generation !== loadGeneration\.current/);
assert.match(firmThreadLoad, /const allowedFirmIds = new Set\(liveIds\)/);
assert.match(firmThreadLoad, /setMsgs\(\(\(m \?\? \[\]\) as Msg\[\]\)\.filter\(\(message\) => allowedFirmIds\.has\(message\.organization_id\)\)\)/);
assert.match(firmThreadLoad, /setRequests\(\(\(r \?\? \[\]\) as RequestLite\[\]\)\.filter\(\(request\) => allowedFirmIds\.has\(request\.organization_id\)\)\)/);


// A realtime INSERT payload is a notification, not proof that the currently
// mounted taxpayer/member still has an active engagement. Re-read through the
// authenticated tenant-scoped loader before publishing message content.
// This source-contract check supplements real two-firm/two-taxpayer RLS tests.
const realtimeThread = thread.src.split("  // A unique channel name per mount")[1]
  ?.split("  useEffect(() => {\n    bottom.current?.scrollIntoView")[0] ?? "";
assert.ok(realtimeThread, "realtime message subscription must exist");
assert.match(realtimeThread, /if \(row\.organization_id !== orgId\) return;/,
  "realtime notifications must be scoped to the selected firm");
assert.match(realtimeThread, /void load\(\);/,
  "realtime notification must recheck Auth and engagement grants before publishing");
assert.ok(!realtimeThread.includes("setMsgs((prev) =>"),
  "never append an unverified realtime payload directly to the thread");
assert.match(realtimeThread, /\}, \[taxpayerId, side, orgId, load\]\);/,
  "subscription must capture the current authorization loader");


// A composer must not render its own message before Auth and engagement checks
// complete. The send operation must also refuse a stale taxpayer/firm selection
// after an asynchronous authorization read, before inserting anything.
// This is a source-contract regression; authenticated race/RLS tests remain gates.
const sendInsert = firmThreadSend.indexOf('.from("messages").insert(optimistic)');
const sendGuard = firmThreadSend.indexOf('if (!isCurrentSend()) throw new Error("Message context changed");');
assert.ok(sendInsert > 0 && sendGuard > 0 && sendGuard < sendInsert,
  "send must reject changed taxpayer/firm/load generation before database insert");
assert.match(thread.src, /const currentOrg = useRef\(orgId\)/);
assert.match(thread.src, /currentOrg\.current = orgId/);
assert.ok(firmThreadSend.includes("const sendGeneration = loadGeneration.current;") &&
  firmThreadSend.includes("sendGeneration === loadGeneration.current") &&
  firmThreadSend.includes("taxpayerId === currentTaxpayer.current") &&
  firmThreadSend.includes("chosenOrg === currentOrg.current"),
  "send must bind its async operation to the mounted taxpayer, firm and grant generation");
assert.ok(!firmThreadSend.includes("setMsgs((prev) => [...(prev ?? []), optimistic])"),
  "unverified optimistic content must not be rendered before the authorization check");
assert.ok(firmThreadSend.indexOf('setDraft((value) => value.trim() === body ? "" : value);') > sendInsert &&
  firmThreadSend.indexOf("void load();") > sendInsert,
  "clear sent draft only after insert, then reload through authenticated tenant-scoped reads");
assert.ok(firmThreadSend.includes('if (isCurrentSend()) toast(labels.failed, "error");'),
  "a stale send failure must not report an error in the next tenant context");


// Firm inbox realtime INSERTs are untrusted notifications, not proof that an
// engagement is still active. Do not show payload.body using a cached tenant
// grant set: hide the old inbox and rerun Auth/member/engagement-scoped reads.
// These checks supplement (not replace) authenticated revocation/RLS tests.
const firmInboxRealtime = workspace.src.split('channel = db\n          .channel(`firm-messages-')[1]
  ?.split('          .subscribe();')[0] ?? "";
assert.ok(firmInboxRealtime, "firm inbox realtime callback must exist");
assert.ok(firmInboxRealtime.includes('row.organization_id !== firmOrgId') &&
  firmInboxRealtime.includes('!allowedTaxpayers.has(row.taxpayer_id)'),
  "firm inbox realtime events must retain organization and taxpayer guards");
assert.ok(!firmInboxRealtime.includes('body: row.body') &&
  !firmInboxRealtime.includes('setPreviews((prev) =>'),
  "firm inbox must not publish an unverified realtime message body");
for (const clear of ["setClients(null)", "setPreviews({})", "setActive(null)",
  "setAssignments([])", "setRefreshEpoch((epoch) => epoch + 1)"]) {
  assert.ok(firmInboxRealtime.includes(clear),
    "realtime event must invalidate old firm inbox state before rechecking grants: " + clear);
}


// The OTP member session must also be invalidated when the Supabase Auth
// identity changes independently of the OTP session. A routine same-user
// SIGNED_IN/USER_UPDATED event must not blank an active inbox.
// Source-contract coverage only: authenticated account-switch tests remain a
// staging release gate.
assert.match(firmMessagesEntry, /const authUserId = useRef<string \| null \| undefined>\(undefined\)/,
  "firm inbox must track the authenticated user independently of OTP session");
assert.ok(firmMessagesEntry.includes("auth.onAuthStateChange((event, authSession) =>"),
  "firm inbox must subscribe to Auth identity changes");
assert.ok(firmMessagesEntry.includes('event === "INITIAL_SESSION"') &&
  firmMessagesEntry.includes('event === "SIGNED_OUT"') &&
  firmMessagesEntry.includes('event !== "SIGNED_IN" && event !== "USER_UPDATED"'),
  "firm inbox must handle initial, sign-out and account-switch events");
assert.ok(firmMessagesEntry.includes("if (!nextUserId) setSession(null);"),
  "an unauthenticated initial session must hide any persisted OTP inbox");
assert.ok(firmMessagesEntry.includes("if (authUserId.current !== undefined && nextUserId !== authUserId.current)"),
  "firm inbox must compare identities rather than clear on every token refresh");
assert.ok(firmMessagesEntry.includes("authUserId.current = nextUserId;") &&
  firmMessagesEntry.includes("subscription.unsubscribe();"),
  "firm inbox must update tracked identity and clean up its auth subscription");


// An Auth read failure or a taxpayer session with no RLS-visible taxpayer
// must not keep a previously authorized invitation inbox, firm directory,
// draft engagement, or recipient choice visible. Routine successful refreshes
// still preserve their existing selections. These are source-contract checks;
// authenticated account-switch/fault-injection acceptance remains required.
const failedInvitationAuth = invitationLoad.split("if (authError || !auth.user) {")[1]?.split("\n    setUserId(auth.user.id);")[0] ?? "";
const missingInvitationTaxpayer = invitationLoad.split('if (side === "taxpayer" && !tp) {')[1]?.split("\n    const [rows, directory, engagements]")[0] ?? "";
for (const [scenario, body] of [
  ["Auth unavailable", failedInvitationAuth],
  ["taxpayer unavailable", missingInvitationTaxpayer],
]) {
  assert.ok(body, scenario + ": invitation failure branch must exist");
  for (const cleared of ["setInvites([])", "setDrafts([])", "setFirms([])",
    'setFirm("")', 'setEngagement("")', 'setRecipientEmail("")']) {
    assert.ok(body.includes(cleared), scenario + ": clear stale " + cleared);
  }
  assert.ok(body.indexOf("setInvites([])") < body.indexOf("setError("),
    scenario + ": hide prior-tenant rows before reporting the failure");
}


// Firm invitation reads must be restricted to live active memberships, not
// only the broad RLS-visible invitation collection. A member of two firms may
// see both, but must never receive a third firm's invitation or draft rows.
// These source contracts supplement authenticated two-firm RLS acceptance.
const firmInvitationLoad = invitations.src.split("  const load = useCallback(async (options?")[1]
  ?.split("\n  useEffect(() => {")[0] ?? "";
assert.ok(firmInvitationLoad, "invitation loader must exist");
const memberLookup = firmInvitationLoad.indexOf('.from("firm_members")');
const invitationLookup = firmInvitationLoad.indexOf('.from("engagement_invitations")');
assert.ok(memberLookup >= 0 && memberLookup < invitationLookup,
  "read live firm memberships before loading invitations");
for (const constraint of [
  '.eq("auth_user_id", auth.user.id)', '.eq("active", true)',
  '.is("deactivated_at", null)',
]) {
  assert.ok(firmInvitationLoad.includes(constraint),
    "firm membership must be bound to current authenticated user: " + constraint);
}
assert.ok(firmInvitationLoad.includes("if (members.error || !memberOrgIds.length) {"),
  "missing or failed active firm membership must fail closed");
assert.ok(firmInvitationLoad.includes('setInvites([])') &&
  firmInvitationLoad.includes('setDrafts([])'),
  "failed membership must clear previously visible invitation and draft data");
assert.ok(firmInvitationLoad.includes('.in("organization_id", memberOrgIds)'),
  "firm invitation queries must filter organization IDs to live memberships");
assert.ok((firmInvitationLoad.match(/\.in\("organization_id", memberOrgIds\)/g) ?? []).length >= 2,
  "both invitations and draft engagements must be scoped to live firm memberships");


// Taxpayer invitation reads must be scoped at the database query boundary to
// the currently RLS-resolved taxpayer, not only filtered while rendering.
// A signed-in operator with more than one visible taxpayer must not load
// another taxpayer's invitations into this component's state.
const taxpayerInvitationQuery = firmInvitationLoad.split("const scopedInvitationQuery =")[1]
  ?.split("const [rows, directory, engagements]")[0] ?? "";
assert.ok(taxpayerInvitationQuery.includes('side === "firm"') &&
  taxpayerInvitationQuery.includes('.in("organization_id", memberOrgIds)'),
  "preserve live firm membership filtering for firm-side invitations");
assert.ok(taxpayerInvitationQuery.includes('.eq("taxpayer_id", tp ?? "")'),
  "taxpayer invitation query must filter by the RLS-resolved taxpayer ID");
assert.ok(firmInvitationLoad.indexOf('if (side === "taxpayer" && !tp) {') <
  firmInvitationLoad.indexOf("const scopedInvitationQuery ="),
  "reject missing taxpayer before issuing a scoped invitation query");
assert.ok(firmInvitationLoad.includes('scopedInvitationQuery.order("created_at"'),
  "rendered invitation rows must come from the tenant-scoped query");


// A firm-side invitation decision must recheck current live membership
// before calling the transactional decision RPC. A pending invitation visible
// before deactivation is not sufficient authority to accept/revoke it.
// Source-contract regression only; authenticated revocation and RLS tests
// remain required for staging release.
const liveFirmDecision = invitations.src.split("  async function decide(")[1]
  ?.split("  async function requestFirm()")[0] ?? "";
const firmDecisionMembership = liveFirmDecision.indexOf('.from("firm_members")');
const firmDecisionRpc = liveFirmDecision.indexOf('db.rpc("decide_invitation"');
assert.ok(firmDecisionMembership > 0 && firmDecisionMembership < firmDecisionRpc,
  "firm invitation decision must recheck membership before its RPC");
assert.ok(liveFirmDecision.includes('if (side === "firm") {'),
  "firm decision membership recheck must be side-specific");
for (const constraint of [
  '.eq("organization_id", liveInvite.organization_id)',
  '.eq("auth_user_id", liveAuth.user.id)',
  '.eq("active", true)',
  '.is("deactivated_at", null)',
]) {
  assert.ok(liveFirmDecision.includes(constraint),
    "firm decision must validate current organization/user membership: " + constraint);
}
assert.ok(liveFirmDecision.includes("if (activeMemberError || !activeMembers?.length) {"),
  "failed or revoked firm membership must reject invitation decision");
const rejectedFirmDecision = liveFirmDecision.split("if (activeMemberError || !activeMembers?.length) {")[1]
  ?.split("\n      }")[0] ?? "";
assert.ok(rejectedFirmDecision.includes("setInvites([])") &&
  rejectedFirmDecision.includes("setDrafts([])") &&
  rejectedFirmDecision.includes("await load({ keepError: true });") &&
  rejectedFirmDecision.includes("return;"),
  "rejected firm decision must hide stale tenant data and fail closed");


// A taxpayer invitation decision must bind the live RLS-resolved taxpayer
// to the invitation immediately before the decision RPC. The same signed-in
// user can switch taxpayer context without a Supabase Auth identity event.
// Source-contract coverage; authenticated multi-taxpayer and replay tests
// remain required before release.
const taxpayerDecisionCheck = liveFirmDecision.indexOf("await sessionTaxpayerId()");
assert.ok(taxpayerDecisionCheck > 0 && taxpayerDecisionCheck < firmDecisionRpc,
  "taxpayer invitation decision must re-resolve current taxpayer before RPC");
assert.ok(liveFirmDecision.includes('if (side === "taxpayer") {'),
  "taxpayer recheck must only run for taxpayer-side invitation decisions");
assert.ok(liveFirmDecision.includes("liveTaxpayerId !== taxpayerId") &&
  liveFirmDecision.includes("liveTaxpayerId !== liveInvite.taxpayer_id"),
  "taxpayer decision must match both the selected taxpayer and live invitation");
const rejectedTaxpayerDecision = liveFirmDecision.split("if (!liveTaxpayerId ||")[1]
  ?.split("\n      }")[0] ?? "";
assert.ok(rejectedTaxpayerDecision.includes("setInvites([])") &&
  rejectedTaxpayerDecision.includes("setFirms([])") &&
  rejectedTaxpayerDecision.includes('setFirm("")') &&
  rejectedTaxpayerDecision.includes("await load({ keepError: true });") &&
  rejectedTaxpayerDecision.includes("return;"),
  "changed taxpayer context must clear stale invitation data and reject the decision");


// Invitation decisions, firm requests and contact invitations share one
// synchronous single-flight guard. React state alone may not prevent two
// rapid clicks (or different actions) before the busy render commits.
// These source-contract checks complement authenticated replay testing.
assert.ok(invitations.src.includes("const mutationInFlight = useRef(false);"),
  "invitation panel must track synchronous mutation in-flight state");
const beginInvitationMutation = invitations.src.split("function beginMutation()")[1]
  ?.split("function finishMutation(")[0] ?? "";
assert.ok(beginInvitationMutation.includes("if (mutationInFlight.current) return false;") &&
  beginInvitationMutation.includes("mutationInFlight.current = true;"),
  "single-flight guard must acquire synchronously before async work");
const finishInvitationMutation = invitations.src.split("function finishMutation(")[1]
  ?.split("async function decide(")[0] ?? "";
assert.ok(finishInvitationMutation.includes("epoch !== authEpoch.current") &&
  finishInvitationMutation.includes("mutationInFlight.current = false;"),
  "release must be scoped to the original Auth epoch");
for (const [name, start, end, rpc] of [
  ["decision", "async function decide(", "async function requestFirm()", 'db.rpc("decide_invitation"'],
  ["firm request", "async function requestFirm()", "async function inviteContact()", 'db.rpc("create_invitation"'],
  ["contact invitation", "async function inviteContact()", "  return (", 'db.rpc("create_invitation_for_contact"'],
]) {
  const body = invitations.src.split(start)[1]?.split(end)[0] ?? "";
  const acquire = body.indexOf("if (!beginMutation()) return;");
  assert.ok(acquire >= 0 && acquire < body.indexOf(rpc),
    name + ": acquire single-flight guard before RPC");
  assert.ok(body.includes("finishMutation(epoch)"),
    name + ": release single-flight guard on completion");
}
const invitationAuthReset = invitations.src.split("auth.onAuthStateChange(")[1]
  ?.split("subscription.unsubscribe();")[0] ?? "";
assert.ok(invitationAuthReset.includes("mutationInFlight.current = false;"),
  "Auth identity changes must release the prior user's mutation lock");


// A firm operator may belong to multiple organizations. An engagement moved
// between firms after the invitation form loaded must not silently redirect a
// contact invitation to another firm the operator also belongs to.
// Source-contract only; authenticated cross-firm tests remain required.
assert.ok(invitations.src.includes("type DraftEngagement = { id: string; taxpayer_id: string; organization_id: string }"),
  "draft selection must retain its original organization ID");
assert.ok(firmInvitationLoad.includes('.select("id,taxpayer_id,organization_id").in("organization_id", memberOrgIds)'),
  "firm draft loader must retain the selected organization's ID");
const contactInvitationBody = invitations.src.split("  async function inviteContact()")[1]
  ?.split("\n  return (")[0] ?? "";
const contactLiveDraft = contactInvitationBody.indexOf('.from("engagements")');
const contactRpc = contactInvitationBody.indexOf('db.rpc("create_invitation_for_contact"');
assert.ok(contactLiveDraft > 0 && contactRpc > contactLiveDraft,
  "contact invitation must fetch live engagement before RPC");
assert.ok(contactInvitationBody.includes("liveDraft.organization_id !== selectedDraft.organization_id") &&
  contactInvitationBody.indexOf("liveDraft.organization_id !== selectedDraft.organization_id") < contactRpc,
  "contact invitation must reject an engagement reassigned to another firm");
assert.ok(contactInvitationBody.includes("await rejectStale();") &&
  contactInvitationBody.includes('.eq("organization_id", liveDraft.organization_id)'),
  "changed firm must fail closed while preserving live membership verification");


// Phase 4: an upload can outlive the request's authorization snapshot.
// A stale upload must never move a reviewed/accepted or reassigned request
// backwards to "submitted", nor update a different tenant's request by ID.
// Source contract only; staging race/RLS tests remain required.
const uploadWriter = inspect("lib/submit-request.ts").src;
const uploadStatusWrite = uploadWriter.split('db.from("document_requests")')[1]
  ?.split("if (statusError")[0] ?? "";
assert.ok(uploadStatusWrite, "document upload must use a conditional status write");
for (const guard of [
  '.eq("id", input.requestId)',
  '.eq("taxpayer_id", input.taxpayerId)',
  '.eq("organization_id", input.organizationId)',
  '.eq("status", input.previousStatus)',
  '.eq("responsible", "taxpayer")',
  '.select("id")',
]) {
  assert.ok(uploadStatusWrite.includes(guard), "upload status CAS missing: " + guard);
}
assert.ok(uploadStatusWrite.includes('status: "submitted"'),
  "a client upload must only submit, never accept, its request");
assert.ok(uploadWriter.includes("if (statusError || !changed?.length)"),
  "a failed or zero-row conditional update must fail closed");
assert.ok(!uploadWriter.includes('updateById("document_requests"'),
  "upload must not use an ID-only update that can overwrite later review decisions");


// Phase 4 executable regression: an accepted/submitted document request must
// never be reopened by a direct or stale caller of the shared upload helper.
// Exercise the actual TypeScript function with a mocked Supabase boundary so
// disallowed transitions are rejected BEFORE any storage/database access.
const uploadStatusGuardSource = readFileSync("lib/submit-request.ts", "utf8");
const uploadStatusGuardCjs = ts.transpileModule(uploadStatusGuardSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const uploadStatusGuardModule = { exports: {} };
let uploadStatusGuardDbCalls = 0;
runInNewContext(uploadStatusGuardCjs, {
  module: uploadStatusGuardModule,
  exports: uploadStatusGuardModule.exports,
  require: (id) => {
    if (id === "./record-event") return { recordCaseEvent: async () => {} };
    if (id === "./supabase") return {
      supabase: () => { uploadStatusGuardDbCalls++; throw new Error("Mock DB boundary"); },
      audit: async () => {},
    };
    throw new Error("Unexpected dependency: " + id);
  },
});
for (const [previousStatus, expectedReason] of [
  ["accepted", "status"],
  ["submitted", "status"],
  ["unexpected", "status"],
  ["requested", "error"],
]) {
  const result = await uploadStatusGuardModule.exports.submitRequestFile({
    requestId: "request-1",
    file: { name: "proof.pdf", size: 10, type: "application/pdf" },
    taxpayerId: "taxpayer-1",
    organizationId: "firm-1",
    caseId: "case-1",
    label: "Proof",
    actorLabel: "Client",
    previousStatus,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, reason: expectedReason },
    "upload status guard must fail closed for " + previousStatus);
}
assert.equal(uploadStatusGuardDbCalls, 1,
  "only an eligible status may reach the storage/database boundary");


// Phase 4 tenant-isolation regression: the requests board must not keep a
// previous taxpayer's rows after an Auth account switch, nor allow an
// in-flight load/upload to populate or submit against the prior identity.
// Source-contract coverage; authenticated two-taxpayer acceptance is required.
const requestsBoardAuth = inspect("components/client-portal/requests-board.tsx").src;
for (const guard of [
  "const loadEpoch = useRef(0);",
  "const authEpoch = useRef(0);",
  "const identityRef = useRef<string | null | undefined>(undefined);",
  "auth.onAuthStateChange(",
  "if (nextUserId === identityRef.current) return;",
  "++authEpoch.current;",
  "++loadEpoch.current;",
  "setIds(null);",
  "setRows(null);",
  "setCases([]);",
  "setName(\"\");",
  "pending.current = null;",
  "subscription.unsubscribe();",
]) {
  assert.ok(requestsBoardAuth.includes(guard), "requests board account isolation missing: " + guard);
}
const requestsBoardLoad = requestsBoardAuth.split("const load = useCallback(async () => {")[1]
  ?.split("}, []);")[0] ?? "";
assert.ok(requestsBoardLoad.includes("const epoch = ++loadEpoch.current;"),
  "requests board must epoch-tag every load");
assert.ok((requestsBoardLoad.match(/epoch !== loadEpoch\.current/g) ?? []).length >= 3,
  "requests board must discard stale taxpayer, request and error results");
assert.ok(requestsBoardLoad.includes("if (rq.error || cs.error || tp.error)"),
  "requests board must not silently treat denied tenant queries as empty data");
const requestsBoardSend = requestsBoardAuth.split("async function send(id: string, file: File) {")[1]
  ?.split("\n  const filters:")[0] ?? "";
assert.ok(requestsBoardSend.includes("const epoch = authEpoch.current;"),
  "requests board upload must bind to the current identity epoch");
assert.ok(requestsBoardSend.includes("const liveTaxpayerId = await sessionTaxpayerId();"),
  "requests board upload must re-resolve the live taxpayer before storage");
assert.ok(requestsBoardSend.includes("user.id !== identityRef.current") &&
  requestsBoardSend.includes("liveTaxpayerId !== ids.taxpayerId"),
  "requests board must refuse a changed Auth user or taxpayer");
assert.ok(requestsBoardSend.indexOf("liveTaxpayerId !== ids.taxpayerId") <
  requestsBoardSend.indexOf("await submitRequestFile("),
  "requests board must refuse a stale tenant before storage");
assert.ok((requestsBoardSend.match(/epoch !== authEpoch\.current/g) ?? []).length >= 2,
  "requests board must discard stale upload preflight and completion");


// Phase 4 RequestsBoard upload replay: React busy state is asynchronous and
// does not prevent rapid file-change events or parallel uploads on other rows.
// A synchronous component-wide guard must serialize all request submissions.
// Source-contract coverage only: staging must still exercise real replay/RLS.
const requestsBoardSingleFlight = inspect("components/client-portal/requests-board.tsx").src;
assert.ok(requestsBoardSingleFlight.includes("const uploadInFlight = useRef(false);"),
  "RequestsBoard must maintain a synchronous upload-in-flight lock");
const boardSingleFlightSend = requestsBoardSingleFlight.split("async function send(id: string, file: File) {")[1]
  ?.split("\n  const filters:")[0] ?? "";
const boardLockCheck = boardSingleFlightSend.indexOf("if (uploadInFlight.current) return;");
const boardLockAcquire = boardSingleFlightSend.indexOf("uploadInFlight.current = true;");
const boardFirstAuthRead = boardSingleFlightSend.indexOf("await supabase().auth.getUser()");
assert.ok(boardLockCheck >= 0 && boardLockCheck < boardLockAcquire &&
  boardLockAcquire < boardFirstAuthRead,
  "RequestsBoard must acquire the single-flight lock before async authorization");
const boardSingleFlightFinally = boardSingleFlightSend.split("} finally {")[1] ?? "";
assert.ok(boardSingleFlightFinally.includes("if (epoch === authEpoch.current)") &&
  boardSingleFlightFinally.includes("uploadInFlight.current = false;"),
  "only the originating Auth epoch may release its upload lock");
const boardAuthChange = requestsBoardSingleFlight.split("auth.onAuthStateChange((event, session) => {")[1]
  ?.split("\n    });")[0] ?? "";
assert.ok(boardAuthChange.includes("uploadInFlight.current = false;"),
  "an actual Auth identity change must release the prior upload lock");
const boardUnmount = requestsBoardSingleFlight.split("    return () => {")[1]
  ?.split("subscription.unsubscribe();")[0] ?? "";
assert.ok(boardUnmount.includes("uploadInFlight.current = false;"),
  "RequestsBoard must release the lock on unmount");
assert.ok(requestsBoardSingleFlight.includes("disabled={busy !== null}"),
  "disable every request upload button while any upload is in progress");


// Phase 4: stale or cross-tenant document request must be refused before
// uploading storage bytes or inserting a document. This executes the actual
// helper against a synthetic, RLS-shaped PostgREST query boundary; it does
// not substitute for two-taxpayer staging RLS/revocation acceptance.
async function probeLiveDocumentRequest({ caseId = "case-1", liveRow = null, denied = false } = {}) {
  const calls = [];
  const requestQuery = {
    select(columns) { calls.push(["select", columns]); return this; },
    eq(column, value) { calls.push(["eq", column, value]); return this; },
    is(column, value) { calls.push(["is", column, value]); return this; },
    async maybeSingle() {
      calls.push(["maybeSingle"]);
      return { data: liveRow, error: denied ? { message: "RLS denied" } : null };
    },
  };
  const db = {
    from(table) {
      calls.push(["from", table]);
      if (table !== "document_requests") throw new Error("Unexpected table before storage: " + table);
      return requestQuery;
    },
    storage: {
      from(bucket) {
        calls.push(["storage", bucket]);
        throw new Error("Storage boundary reached");
      },
    },
  };
  const module = { exports: {} };
  runInNewContext(uploadStatusGuardCjs, {
    module,
    exports: module.exports,
    require: (id) => {
      if (id === "./record-event") return { recordCaseEvent: async () => {} };
      if (id === "./supabase") return { supabase: () => db, audit: async () => {} };
      throw new Error("Unexpected dependency: " + id);
    },
  });
  const result = await module.exports.submitRequestFile({
    requestId: "request-1",
    file: { name: "proof.pdf", size: 10, type: "application/pdf" },
    taxpayerId: "taxpayer-1",
    organizationId: "firm-1",
    caseId,
    label: "Proof",
    actorLabel: "Client",
    previousStatus: "requested",
  });
  return { result: JSON.parse(JSON.stringify(result)), calls };
}
for (const scenario of [
  { caseId: "case-1", liveRow: null },
  { caseId: null, liveRow: null },
  { caseId: "case-1", liveRow: null, denied: true },
]) {
  const { result, calls } = await probeLiveDocumentRequest(scenario);
  assert.deepEqual(result, { ok: false, reason: "status" },
    "missing or RLS-denied request must fail before storage");
  assert.ok(!calls.some(([op]) => op === "storage"),
    "refused request must not upload an orphaned storage object");
  for (const [column, value] of [
    ["id", "request-1"], ["taxpayer_id", "taxpayer-1"],
    ["organization_id", "firm-1"], ["status", "requested"],
    ["responsible", "taxpayer"],
  ]) {
    assert.ok(calls.some(([op, col, val]) => op === "eq" && col === column && val === value),
      "live request preflight must scope " + column);
  }
  assert.ok(calls.some(([op, col, val]) =>
    op === (scenario.caseId === null ? "is" : "eq") &&
    col === "case_id" && val === scenario.caseId),
    "live request preflight must bind the exact case, including null");
}
const matchingRequest = await probeLiveDocumentRequest({ liveRow: { id: "request-1" } });
assert.deepEqual(matchingRequest.result, { ok: false, reason: "error" },
  "matching live request may reach the mocked storage boundary");
assert.ok(matchingRequest.calls.some(([op]) => op === "storage"),
  "matching live request must pass preflight before storage");
