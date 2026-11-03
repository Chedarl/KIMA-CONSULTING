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
const uploadStatusWrite = uploadWriter.split('const statusQuery = db.from("document_requests")')[1]
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


// Phase 3 invitation decisions: a rejected Auth, RLS, or RPC promise must
// not leave the synchronous mutation lock stuck until an account switch.
// The error must be localized, and the originating epoch alone may release
// the lock. Source contract only; authenticated network-failure acceptance
// remains required in staging.
const decisionNetworkBody = invitations.src.split("  async function decide(")[1]
  ?.split("\n  async function requestFirm(")[0] ?? "";
const decisionMutationStart = decisionNetworkBody.indexOf("if (!beginMutation()) return;");
const decisionTry = decisionNetworkBody.indexOf("try {", decisionMutationStart);
const decisionDb = decisionNetworkBody.indexOf("const db = supabase();", decisionMutationStart);
const decisionCatch = decisionNetworkBody.lastIndexOf("} catch {");
const decisionFinally = decisionNetworkBody.lastIndexOf("} finally {");
assert.ok(decisionMutationStart >= 0 && decisionTry > decisionMutationStart &&
  decisionDb > decisionTry && decisionCatch > decisionDb && decisionFinally > decisionCatch,
  "invitation decision must protect Auth/RLS/RPC awaits with try/catch/finally");
assert.ok(decisionNetworkBody.slice(decisionCatch, decisionFinally).includes(
  'if (epoch === authEpoch.current) setError(fr ? "Impossible de vérifier les invitations. Actualisez la page." : "Unable to verify invitations. Refresh the page.");'),
  "rejected invitation decision must show FR/EN failure only to its originating account");
assert.ok(decisionNetworkBody.slice(decisionFinally).includes("finishMutation(epoch);"),
  "invitation decision must release its single-flight lock in finally");
assert.equal((decisionNetworkBody.match(/finishMutation\(epoch\);/g) ?? []).length, 1,
  "invitation decision must release its lock exactly once, in finally");


// Phase 3 taxpayer-to-firm requests: rejected Auth, taxpayer RLS, directory,
// invitation RPC or reload promises must not strand the shared mutation lock.
// A single originating-epoch finally release and localized failure are required.
// Source contract only; staging network-failure and replay acceptance remain open.
const firmRequestNetworkBody = invitations.src.split("  async function requestFirm() {")[1]
  ?.split("\n  async function inviteContact()")[0] ?? "";
const firmRequestMutationStart = firmRequestNetworkBody.indexOf("if (!beginMutation()) return;");
const firmRequestTry = firmRequestNetworkBody.indexOf("try {", firmRequestMutationStart);
const firmRequestDb = firmRequestNetworkBody.indexOf("const db = supabase();", firmRequestMutationStart);
const firmRequestCatch = firmRequestNetworkBody.lastIndexOf("} catch {");
const firmRequestFinally = firmRequestNetworkBody.lastIndexOf("} finally {");
assert.ok(firmRequestMutationStart >= 0 && firmRequestTry > firmRequestMutationStart &&
  firmRequestDb > firmRequestTry && firmRequestCatch > firmRequestDb &&
  firmRequestFinally > firmRequestCatch,
  "firm request must protect Auth/taxpayer/directory/RPC awaits with try/catch/finally");
assert.ok(firmRequestNetworkBody.slice(firmRequestCatch, firmRequestFinally).includes(
  'if (epoch === authEpoch.current) setError(fr ? "Impossible de vérifier la demande. Actualisez la page." : "Unable to verify the request. Refresh the page.");'),
  "rejected firm request must show FR/EN failure only for the originating account");
assert.ok(firmRequestNetworkBody.slice(firmRequestFinally).includes("finishMutation(epoch);"),
  "firm request must release its synchronous mutation lock in finally");
assert.equal((firmRequestNetworkBody.match(/finishMutation\(epoch\);/g) ?? []).length, 1,
  "firm request must release its lock exactly once in finally");


// Phase 3 firm-to-client contact invitations: an Auth/RLS/membership/RPC
// rejection must never strand the shared invitation mutation lock.
// Source-contract regression; authenticated rejection and replay tests still
// require staging and an independent security review.
const contactInviteNetworkBody = invitations.src.split("  async function inviteContact() {")[1]
  ?.split("\n  return (")[0] ?? "";
const contactMutationStart = contactInviteNetworkBody.indexOf("if (!beginMutation()) return;");
const contactTry = contactInviteNetworkBody.indexOf("try {", contactMutationStart);
const contactDb = contactInviteNetworkBody.indexOf("const db = supabase();", contactMutationStart);
const contactCatch = contactInviteNetworkBody.lastIndexOf("} catch {");
const contactFinally = contactInviteNetworkBody.lastIndexOf("} finally {");
assert.ok(contactMutationStart >= 0 && contactTry > contactMutationStart &&
  contactDb > contactTry && contactCatch > contactDb && contactFinally > contactCatch,
  "contact invitation must protect Auth/engagement/membership/RPC awaits with try/catch/finally");
assert.ok(contactInviteNetworkBody.slice(contactCatch, contactFinally).includes(
  'if (epoch === authEpoch.current) setError(fr ? "Impossible de vérifier le destinataire. Actualisez la page." : "Unable to verify the recipient. Refresh the page.");'),
  "rejected contact invitation must show localized failure only to its originating identity");
assert.ok(contactInviteNetworkBody.slice(contactFinally).includes("finishMutation(epoch);"),
  "contact invitation must release its single-flight lock in finally");
assert.equal((contactInviteNetworkBody.match(/finishMutation\(epoch\);/g) ?? []).length, 1,
  "contact invitation must release its lock exactly once, in finally");


// Stage-control CAS: a cached firm screen cannot advance another tenant's
// case, or replay a stage transition after a concurrent change.
// Synthetic database-boundary regression; authenticated staging remains open.
const stageMove = detail.src.split("async function move(to: CaseStage) {")[1]?.split("\n  /**")[0] ?? "";
assert.ok(stageMove.includes('updateById("compliance_cases", row.id, result.patch, {'),
  "stage advance must use conditional, not ID-only, PATCH");
for (const guard of [
  "stage: row.stage", "approval_round: row.approval_round",
  "taxpayer_id: row.taxpayer_id", "engagement_id: engagement.id",
  "organization_id: engagement.organization_id",
]) assert.ok(stageMove.includes(guard), "stage CAS missing " + guard);
const writerSource = inspect("lib/db-write.ts").src;
assert.ok(writerSource.includes(".match(expected)"), "DB writer must match original case fields");
const writerCjs = ts.transpileModule(writerSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const writerModule = { exports: {} };
const stored = { id: "case-1", taxpayer_id: "taxpayer-A", organization_id: "firm-A",
  engagement_id: "engagement-A", stage: "review", approval_round: 2 };
runInNewContext(writerCjs, {
  module: writerModule, exports: writerModule.exports,
  require: (id) => {
    if (id !== "./supabase") throw new Error("Unexpected writer dependency: " + id);
    return { supabase: () => ({ from: () => ({ update: (patch) => {
      const filters = {};
      return {
        eq(key, value) { filters[key] = value; return this; },
        match(expected) { Object.assign(filters, expected); return this; },
        async select() {
          if (!Object.entries(filters).every(([key, value]) => stored[key] === value))
            return { data: [], error: null };
          Object.assign(stored, patch);
          return { data: [{ id: stored.id }], error: null };
        },
      };
    } }) }) };
  },
});
const original = { taxpayer_id: "taxpayer-A", organization_id: "firm-A",
  engagement_id: "engagement-A", stage: "review", approval_round: 2 };
const wrongFirm = await writerModule.exports.updateById("compliance_cases", "case-1",
  { stage: "filing" }, { ...original, organization_id: "firm-B" });
assert.deepEqual(JSON.parse(JSON.stringify(wrongFirm)), { ok: false, reason: "not_permitted" });
assert.equal(stored.stage, "review");
const firstMove = await writerModule.exports.updateById("compliance_cases", "case-1",
  { stage: "filing" }, original);
assert.deepEqual(JSON.parse(JSON.stringify(firstMove)), { ok: true });
const staleReplay = await writerModule.exports.updateById("compliance_cases", "case-1",
  { stage: "evidence" }, original);
assert.deepEqual(JSON.parse(JSON.stringify(staleReplay)), { ok: false, reason: "not_permitted" });
assert.equal(stored.stage, "filing");

// Document review must compare-and-swap the exact submitted request and tenant.
// A stale accepted/returned decision cannot overwrite a later review, and a
// returned-then-resubmitted request must not be mistaken for the old submission.
const settle = detail.src.split('async function settleRequest(r: CaseRequest, to: "accepted" | "returned") {')[1]?.split("\n  async function createRequest()")[0] ?? "";
assert.ok(settle.includes('r.status !== "submitted"'),
  "firm document review must refuse non-submitted requests");
assert.ok(settle.includes('engagement.id !== row.engagement_id') &&
  settle.includes('engagement.taxpayer_id !== row.taxpayer_id') &&
  settle.includes('engagement.revoked_at'),
  "document review must require the current case engagement and reject revocation");
assert.ok(settle.includes('allowed(to === "accepted" ? "document.review" : "request.return")'),
  "document review must recheck the requested capability in the handler");
assert.ok(settle.includes('updateById("document_requests", r.id, patch, {'),
  "document review must use a conditional PATCH, not an ID-only update");
for (const guard of [
  "case_id: row.id", "taxpayer_id: row.taxpayer_id",
  "organization_id: engagement.organization_id", 'status: "submitted"',
  "returned_count: r.returned_count", "responsible: r.responsible",
]) assert.ok(settle.includes(guard), "document review CAS missing " + guard);

Object.assign(stored, {
  id: "request-1", case_id: "case-1", taxpayer_id: "taxpayer-A",
  organization_id: "firm-A", status: "submitted", returned_count: 0,
  responsible: "taxpayer",
});
const originalRequest = {
  case_id: "case-1", taxpayer_id: "taxpayer-A", organization_id: "firm-A",
  status: "submitted", returned_count: 0, responsible: "taxpayer",
};
const wrongRequestTenant = await writerModule.exports.updateById(
  "document_requests", "request-1", { status: "accepted" },
  { ...originalRequest, organization_id: "firm-B" });
assert.deepEqual(JSON.parse(JSON.stringify(wrongRequestTenant)),
  { ok: false, reason: "not_permitted" });
assert.equal(stored.status, "submitted");
const firstReview = await writerModule.exports.updateById(
  "document_requests", "request-1", { status: "returned", returned_count: 1 },
  originalRequest);
assert.deepEqual(JSON.parse(JSON.stringify(firstReview)), { ok: true });
const staleReview = await writerModule.exports.updateById(
  "document_requests", "request-1", { status: "accepted" }, originalRequest);
assert.deepEqual(JSON.parse(JSON.stringify(staleReview)),
  { ok: false, reason: "not_permitted" });
stored.status = "submitted"; // Client resubmits; old review must still be refused.
const staleResubmissionReview = await writerModule.exports.updateById(
  "document_requests", "request-1", { status: "accepted" }, originalRequest);
assert.deepEqual(JSON.parse(JSON.stringify(staleResubmissionReview)),
  { ok: false, reason: "not_permitted" });
assert.equal(stored.status, "submitted");



// Firm case tasks: button visibility is not authorization. A task update must
// belong to the displayed case and compare the original task state atomically.
// These synthetic PostgREST-boundary probes supplement authenticated staging.
const toggleTaskBody = detail.src.split("async function toggleTask(task: CaseTask) {")[1]
  ?.split("\n  /** A note's audience")[0] ?? "";
assert.ok(toggleTaskBody.includes("task.case_id !== row.id"),
  "task mutation must reject a task from another case");
assert.ok(toggleTaskBody.includes('allowed("case.advance").ok') &&
  toggleTaskBody.includes("engagement.id !== row.engagement_id") &&
  toggleTaskBody.includes("engagement.taxpayer_id !== row.taxpayer_id") &&
  toggleTaskBody.includes("engagement.revoked_at"),
  "task mutation must independently enforce role and active engagement");
assert.ok(toggleTaskBody.includes('!["open", "done"].includes(task.state)'),
  "cancelled tasks must not be reopened by a stale control");
assert.ok(toggleTaskBody.includes('updateById("case_tasks", task.id, {') &&
  toggleTaskBody.includes("case_id: row.id") &&
  toggleTaskBody.includes("state: task.state"),
  "task mutation must use a case-scoped, original-state conditional PATCH");

Object.assign(stored, {
  id: "task-1", case_id: "case-A", state: "open", completed_at: null,
});
const taskOriginal = { case_id: "case-A", state: "open" };
const wrongTaskCase = await writerModule.exports.updateById(
  "case_tasks", "task-1", { state: "done", completed_at: "2026-11-03T00:00:00Z" },
  { ...taskOriginal, case_id: "case-B" });
assert.deepEqual(JSON.parse(JSON.stringify(wrongTaskCase)),
  { ok: false, reason: "not_permitted" });
assert.equal(stored.state, "open");
const firstTaskUpdate = await writerModule.exports.updateById(
  "case_tasks", "task-1", { state: "done", completed_at: "2026-11-03T00:00:00Z" },
  taskOriginal);
assert.deepEqual(JSON.parse(JSON.stringify(firstTaskUpdate)), { ok: true });
const replayTaskUpdate = await writerModule.exports.updateById(
  "case_tasks", "task-1", { state: "done", completed_at: "2026-11-03T00:01:00Z" },
  taskOriginal);
assert.deepEqual(JSON.parse(JSON.stringify(replayTaskUpdate)),
  { ok: false, reason: "not_permitted" });
assert.equal(stored.completed_at, "2026-11-03T00:00:00Z");


// Firm case notes: a cached case and a disabled client-visible checkbox do not
// authorize an insert. Require live authenticated membership and exact tenant
// engagement/case scope before creating either internal or client-visible events.
// Source contracts + real capability-engine probes; authenticated staging
// revocation, account-switch and two-firm acceptance remain release gates.
const noteWriteBody = detail.src.split("async function saveNote() {")[1]
  ?.split("\n  if (missing)")[0] ?? "";
assert.ok(noteWriteBody.includes('allowed(noteClient ? "note.write_client" : "event.view_internal").ok'),
  "note insert must recheck its visibility-specific capability");
for (const guard of [
  "engagement.id !== row.engagement_id",
  "engagement.taxpayer_id !== row.taxpayer_id",
  "engagement.revoked_at",
  '["authorized", "accepted"].includes(engagement.status)',
]) assert.ok(noteWriteBody.includes(guard), "note insert missing tenant guard: " + guard);
const noteInsert = noteWriteBody.indexOf('.from("case_events").insert(event)');
const noteAuth = noteWriteBody.indexOf("await db.auth.getUser()");
const noteMember = noteWriteBody.indexOf('.from("firm_members")');
const noteMemberBinding = noteWriteBody.indexOf('.eq("auth_user_id", user.id)');
const noteCase = noteWriteBody.indexOf('.from("compliance_cases")');
const noteEngagement = noteWriteBody.indexOf('.from("engagements")');
assert.ok(noteAuth >= 0 && noteAuth < noteMember && noteMember < noteMemberBinding &&
  noteMemberBinding < noteCase && noteCase < noteEngagement &&
  noteEngagement < noteInsert,
  "note insert must verify live Auth member, case and engagement before event insertion");
assert.ok(noteWriteBody.includes('.eq("organization_id", engagement.organization_id)') &&
  noteWriteBody.includes('.eq("taxpayer_id", row.taxpayer_id)') &&
  noteWriteBody.includes('.is("revoked_at", null)'),
  "note preflight must bind the exact firm/taxpayer and reject revoked engagement");
assert.ok(noteWriteBody.includes('if (authError || !user) throw') &&
  noteWriteBody.includes('if (memberError || !liveMember') &&
  noteWriteBody.includes('if (caseError || !liveCase) throw') &&
  noteWriteBody.includes('if (engagementError || !liveEngagement) throw'),
  "note preflight must fail closed on missing, denied or stale grants");

const notePermissionsSource = inspect("lib/permissions.ts").src;
const notePermissionsCjs = ts.transpileModule(notePermissionsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const notePermissionsModule = { exports: {} };
runInNewContext(notePermissionsCjs, {
  module: notePermissionsModule, exports: notePermissionsModule.exports,
});
const noteCan = notePermissionsModule.exports.can;
const noteMemberBase = { id: "member-A", person_label: "A", email: null,
  active: true, deactivated_at: null };
const noteActor = (role, assignedTaxpayerIds = []) => ({
  kind: "firm", member: { ...noteMemberBase, role }, assignedTaxpayerIds,
});
assert.equal(noteCan(noteActor("kima_admin"), "note.write_client", "taxpayer-A").ok, false,
  "platform administrators cannot create client-visible professional notes");
assert.equal(noteCan(noteActor("firm_staff", ["taxpayer-B"]),
  "note.write_client", "taxpayer-A").ok, false,
  "staff cannot create notes outside assigned taxpayers");
assert.equal(noteCan({ kind: "firm", member: { ...noteMemberBase,
  role: "firm_staff", active: false }, assignedTaxpayerIds: ["taxpayer-A"] },
  "note.write_client", "taxpayer-A").ok, false,
  "deactivated staff cannot create client-visible notes");
assert.equal(noteCan(noteActor("firm_staff", ["taxpayer-A"]),
  "note.write_client", "taxpayer-A").ok, true,
  "assigned active staff retain their existing note capability");

// Firm-created document requests must not trust a cached OTP member or case
// after sign-out, staff deactivation, taxpayer reassignment, or revocation.
// This checks the live Auth/tenant preflight ordering; authenticated staging
// and database RLS tests are still required for release.
const createRequestBody = detail.src.split("async function createRequest() {")[1]
  ?.split("\n  async function toggleTask(")[0] ?? "";
const requestAuth = createRequestBody.indexOf("await db.auth.getUser()");
const requestMember = createRequestBody.indexOf('.from("firm_members")');
const requestMemberBinding = createRequestBody.indexOf('.eq("auth_user_id", user.id)');
const requestCase = createRequestBody.indexOf('.from("compliance_cases")');
const requestEngagement = createRequestBody.indexOf('.from("engagements")');
const requestInsert = createRequestBody.indexOf('.from("document_requests").insert({');
assert.ok(requestAuth >= 0 && requestAuth < requestMember &&
  requestMember < requestMemberBinding && requestMemberBinding < requestCase &&
  requestCase < requestEngagement && requestEngagement < requestInsert,
  "request creation must revalidate live Auth, member, case, engagement before insert");
for (const guard of [
  'allowed("request.create")',
  'if (authError || !user) throw',
  '.eq("id", member.id)',
  '.eq("auth_user_id", user.id)',
  '.eq("active", true)',
  '.is("deactivated_at", null)',
  'liveMember.role !== member.role',
  '.eq("id", row.id)',
  '.eq("taxpayer_id", row.taxpayer_id)',
  '.eq("organization_id", orgId)',
  '.eq("engagement_id", engagement.id)',
  '.in("status", ["authorized", "accepted"])',
  '.is("revoked_at", null)',
  'if (caseError || !liveCase) throw',
  'if (engagementError || !liveEngagement) throw',
  'liveEngagement.assigned_to !== member.person_label',
]) assert.ok(createRequestBody.includes(guard),
  "request creation live tenant guard missing: " + guard);
assert.ok(createRequestBody.includes('if (memberError || !liveMember') &&
  createRequestBody.includes('if (!(liveEngagement.authorized_at || liveEngagement.accepted_at)'),
  "request creation must fail closed on revoked, inactive or unauthorised grants");
assert.equal(noteCan(noteActor("firm_staff", ["taxpayer-B"]),
  "request.create", "taxpayer-A").ok, false,
  "firm staff must not request documents for an unassigned taxpayer");
assert.equal(noteCan(noteActor("firm_staff", ["taxpayer-A"]),
  "request.create", "taxpayer-A").ok, true,
  "assigned firm staff retain the request-creation capability");


// A case-stage decision is professional judgement, not an ID-only update.
// Before the stage CAS, rebind the OTP member to live Auth and the current
// case/engagement; reject account switch, deactivation, revocation and staff
// reassignment. These source contracts supplement the synthetic CAS probe
// above; authenticated two-firm/two-taxpayer staging is still required.
const liveStageMove = detail.src.split("async function move(to: CaseStage) {")[1]
  ?.split("\n  /**")[0] ?? "";
const liveStageAuth = liveStageMove.indexOf("await db.auth.getUser()");
const liveStageMember = liveStageMove.indexOf('.from("firm_members")');
const liveStageCase = liveStageMove.indexOf('.from("compliance_cases")');
const liveStageEngagement = liveStageMove.indexOf('.from("engagements")');
const liveStageWrite = liveStageMove.indexOf('updateById("compliance_cases", row.id, result.patch, {');
assert.ok(liveStageAuth >= 0 && liveStageAuth < liveStageMember &&
  liveStageMember < liveStageCase && liveStageCase < liveStageEngagement &&
  liveStageEngagement < liveStageWrite,
  "stage mutation must verify live Auth, member, exact case and engagement before CAS");
for (const guard of [
  'if (authError || !user) throw',
  '.eq("id", member.id)',
  '.eq("auth_user_id", user.id)',
  '.eq("organization_id", engagement.organization_id)',
  '.eq("active", true)',
  '.is("deactivated_at", null)',
  'liveMember.role !== member.role',
  'liveMember.person_label !== member.person_label',
  '.eq("id", row.id)',
  '.eq("taxpayer_id", row.taxpayer_id)',
  '.eq("engagement_id", engagement.id)',
  '.eq("stage", row.stage)',
  '.eq("approval_round", row.approval_round)',
  '.in("status", ["authorized", "accepted"])',
  '.is("revoked_at", null)',
  'if (caseError || !liveCase) throw',
  'if (engagementError || !liveEngagement) throw',
  'liveEngagement.assigned_to !== member.person_label',
]) assert.ok(liveStageMove.includes(guard),
  "stage mutation missing live tenant or replay guard: " + guard);
assert.equal(noteCan(noteActor("kima_admin"), "case.advance", "taxpayer-A").ok, false,
  "platform admin cannot advance a firm's case");
assert.equal(noteCan(noteActor("firm_staff", ["taxpayer-B"]),
  "case.advance", "taxpayer-A").ok, false,
  "staff cannot advance a different taxpayer's case");
assert.equal(noteCan(noteActor("firm_staff", ["taxpayer-A"]),
  "case.advance", "taxpayer-A").ok, true,
  "active assigned staff retain their case-advance capability");


// CaseDetail is a multi-tenant read surface, not just a write gate. A denied
// related-table query must never render a partial or previous tenant snapshot.
// RLS remains authoritative; this is a fail-closed UI/source-contract check.
const scopedCaseLoad = detail.src.split("const load = useCallback(async () => {")[1]
  ?.split("\n  useEffect(() => {")[0] ?? "";
assert.ok(detail.src.includes("approval_round, owner") &&
  detail.src.includes("self_approved, organization_id"),
  "case load must request the owning firm ID with the case");
for (const guard of [
  '.eq("id", kase.engagement_id)',
  '.eq("taxpayer_id", kase.taxpayer_id)',
  '.eq("organization_id", kase.organization_id)',
  '.from("firm_members").select("id, person_label, role, active, deactivated_at")',
  '.from("engagements").select("taxpayer_id, assigned_to")',
  '.eq("case_id", caseId)',
  'eng.data.organization_id !== kase.organization_id',
  'eng.data.taxpayer_id !== kase.taxpayer_id',
  'if (tp.error ||',
  'assigned.error',
  'reqs.error',
  'tsk.error',
  'evs.error',
  'mem.error',
  'consent.error',
]) assert.ok(scopedCaseLoad.includes(guard),
  "case read missing exact tenant, dependent-read or error guard: " + guard);
assert.ok((scopedCaseLoad.match(/\.eq\("organization_id", kase\.organization_id\)/g) ?? []).length >= 4,
  "engagement, assignments, document requests and member roster must be scoped to the case firm");
assert.ok(scopedCaseLoad.indexOf("if (tp.error ||") > 0 &&
  scopedCaseLoad.indexOf("if (tp.error ||") < scopedCaseLoad.indexOf("setRow(kase)"),
  "no case details may be published before dependent tenant reads are checked");
assert.ok(scopedCaseLoad.includes("if (!c) {") &&
  scopedCaseLoad.includes("setMissing(true);") &&
  (scopedCaseLoad.match(/setRow\(null\)/g) ?? []).length >= 2 &&
  scopedCaseLoad.includes("setEngagement(null);") &&
  scopedCaseLoad.includes("setAssignments([]);") &&
  scopedCaseLoad.includes("setRequests([]);") &&
  scopedCaseLoad.includes("setTasks([]);") &&
  scopedCaseLoad.includes("setEvents([]);") &&
  scopedCaseLoad.includes("setMembers([]);") &&
  scopedCaseLoad.includes("setClientApproved(false);") &&
  scopedCaseLoad.includes("setOffline(false);"),
  "missing/denied tenant reads must clear sensitive state; successful loads must recover offline state");


// Realtime reloads and route changes can overlap. A late result (including
// an RLS-denied result) must not overwrite the latest case's snapshot or
// offline state. Cleanup must invalidate a pending request on unmount.
const epochLoad = detail.src.split("const load = useCallback(async () => {")[1]
  ?.split("\n  useEffect(() => {")[0] ?? "";
const epochFirst = epochLoad.indexOf("const epoch = ++loadEpoch.current;");
const epochMissing = epochLoad.indexOf("if (!c) {");
const epochPublish = epochLoad.indexOf("setRow(kase);");
const epochFanout = epochLoad.indexOf("await Promise.all([");
const epochChecks = [...epochLoad.matchAll(/if \(epoch !== loadEpoch\.current\) return;/g)]
  .map((match) => match.index);
assert.ok(detail.src.includes('useRef') &&
  detail.src.includes("const loadEpoch = useRef(0);") && epochFirst >= 0,
  "case detail must allocate a monotonically increasing request generation");
assert.ok(epochChecks.some((index) => index > epochFirst && index < epochMissing),
  "stale missing/RLS-denied case reads must not clear a newer case");
assert.ok(epochChecks.some((index) => index > epochFanout && index < epochPublish),
  "stale dependent tenant reads must not publish an older case");
assert.match(epochLoad, /} catch \{\s*if \(epoch !== loadEpoch\.current\) return;/,
  "stale read errors must not overwrite newer success with offline state");
const epochEffect = detail.src.split("  useEffect(() => {\n    void load();")[1]
  ?.split("\n  // The signed-in member")[0] ?? "";
assert.ok(epochEffect.includes("++loadEpoch.current;"),
  "case switch or unmount must invalidate outstanding load responses");
const realtimeEffect = detail.src.split("// The client acts on these same rows.")[1]
  ?.split("\n  const member = useMemo")[0] ?? "";
assert.ok(realtimeEffect.includes("let active = true;") &&
  realtimeEffect.includes("if (active) void load()") &&
  realtimeEffect.includes("if (active) setLive(status ===") &&
  realtimeEffect.includes("active = false;"),
  "old realtime callbacks must not supersede the current case or update live status");


// A firm case is not a public case read. A member switch or sign-out must
// invalidate in-flight snapshots, clear previous-tenant state, and refuse to
// render sensitive case data without a firm session. The read must also bind
// the stored firm member to the actual Auth user and the case organization.
const caseSessionEffect = detail.src.split("// The signed-in member is who you are.")[1]
  ?.split("// The client acts on these same rows.")[0] ?? "";
assert.ok(detail.src.includes("const sessionMemberRef = useRef<string | null | undefined>(undefined);"),
  "case detail must track actual firm member identity, not periodic token updates");
for (const guard of [
  "subscribeFirmSession((nextSession) => {",
  "const nextMemberId = nextSession?.memberId ?? null;",
  "const previousMemberId = sessionMemberRef.current;",
  "previousMemberId !== undefined && previousMemberId !== nextMemberId",
  "++loadEpoch.current;",
  "setRow(null);",
  "setTaxpayer(null);",
  "setEngagement(null);",
  "setAssignments([]);",
  "setRequests([]);",
  "setTasks([]);",
  "setEvents([]);",
  "setMembers([]);",
  "setClientApproved(false);",
  "setBusy(null);",
  "setNote(\"\");",
  "if (nextMemberId) void load();",
]) assert.ok(caseSessionEffect.includes(guard),
  "firm session switch must invalidate and clear the previous tenant: " + guard);
const caseSessionLoad = detail.src.split("const load = useCallback(async () => {")[1]
  ?.split("\n  useEffect(() => {")[0] ?? "";
for (const guard of [
  "const firmSession = readFirmSession();",
  "if (!firmSession) throw",
  "await db.auth.getUser()",
  "if (authError || !user) throw",
  '.eq("id", firmSession.memberId)',
  '.eq("auth_user_id", user.id)',
  '.eq("organization_id", kase.organization_id)',
  '.eq("active", true)',
  '.is("deactivated_at", null)',
  "firmMember.error",
  "!firmMember.data",
]) assert.ok(caseSessionLoad.includes(guard),
  "case read must verify the live Auth-bound firm membership: " + guard);
const noFirmSessionGuard = detail.src.indexOf("if (!session) {");
const caseMissingGuard = detail.src.indexOf("if (missing) {");
assert.ok(noFirmSessionGuard > 0 && noFirmSessionGuard < caseMissingGuard,
  "no firm session must render a sign-in gate before any case content");


// Phase 3/4: reviewing a submitted document is a firm-authorized decision.
// The cached OTP member and engagement must not authorize a review after
// Auth account change, member deactivation, reassignment or revocation.
// Source-contract checks complement (but do not replace) authenticated staging
// isolation tests and the existing executable conditional-PATCH replay tests.
const liveReview = detail.src.split('async function settleRequest(r: CaseRequest, to: "accepted" | "returned") {')[1]
  ?.split("\n  async function createRequest()")[0] ?? "";
const reviewAuth = liveReview.indexOf("await db.auth.getUser()");
const reviewMember = liveReview.indexOf('.from("firm_members")');
const reviewCase = liveReview.indexOf('.from("compliance_cases")');
const reviewGrant = liveReview.indexOf('.from("engagements")');
const reviewWrite = liveReview.indexOf('updateById("document_requests", r.id, patch, {');
assert.ok(reviewAuth >= 0 && reviewAuth < reviewMember &&
  reviewMember < reviewCase && reviewCase < reviewGrant &&
  reviewGrant < reviewWrite,
  "document review must revalidate live Auth, firm member, case and engagement before PATCH");
for (const guard of [
  "if (authError || !user) throw",
  '.eq("id", member.id)',
  '.eq("auth_user_id", user.id)',
  '.eq("organization_id", engagement.organization_id)',
  '.eq("active", true)',
  '.is("deactivated_at", null)',
  "liveMember.role !== member.role",
  "liveMember.person_label !== member.person_label",
  '.eq("id", row.id)',
  '.eq("taxpayer_id", row.taxpayer_id)',
  '.eq("engagement_id", engagement.id)',
  "if (caseError || !liveCase) throw",
  '.eq("id", engagement.id)',
  '.in("status", ["authorized", "accepted"])',
  '.is("revoked_at", null)',
  "if (engagementError || !liveEngagement) throw",
  "liveEngagement.assigned_to !== member.person_label",
  "if (!(liveEngagement.authorized_at || liveEngagement.accepted_at)",
]) assert.ok(liveReview.includes(guard),
  "document review live tenant guard missing: " + guard);
assert.ok(liveReview.includes("setRefusedBy(t.notPermitted);"),
  "document review must report permission denial without claiming success");


// Phase 3/4: task completion must not trust a cached OTP member, case or
// engagement after account switch, deactivation, reassignment or revocation.
// This source contract supplements the executable conditional-PATCH replay
// tests; authenticated two-firm/two-taxpayer staging tests are still required.
const taskLivePreflight = detail.src.split("async function toggleTask(task: CaseTask) {")[1]
  ?.split("  /** A note's audience")[0] ?? "";
const taskAuth = taskLivePreflight.indexOf("await db.auth.getUser()");
const taskMember = taskLivePreflight.indexOf('.from("firm_members")');
const taskCase = taskLivePreflight.indexOf('.from("compliance_cases")');
const taskEngagement = taskLivePreflight.indexOf('.from("engagements")');
const taskRow = taskLivePreflight.indexOf('.from("case_tasks")');
const taskPatch = taskLivePreflight.indexOf('updateById("case_tasks", task.id, {');
assert.ok(taskAuth >= 0 && taskAuth < taskMember && taskMember < taskCase &&
  taskCase < taskEngagement && taskEngagement < taskRow && taskRow < taskPatch,
  "task write must revalidate live Auth, firm membership, case, engagement and task before PATCH");
for (const guard of [
  "if (authError || !user) throw",
  '.eq("id", member.id)',
  '.eq("auth_user_id", user.id)',
  '.eq("organization_id", engagement.organization_id)',
  '.eq("active", true)',
  '.is("deactivated_at", null)',
  "liveMember.role !== member.role",
  "liveMember.person_label !== member.person_label",
  '.eq("id", row.id)',
  '.eq("taxpayer_id", row.taxpayer_id)',
  '.eq("engagement_id", engagement.id)',
  "if (caseError || !liveCase) throw",
  '.eq("id", engagement.id)',
  '.in("status", ["authorized", "accepted"])',
  '.is("revoked_at", null)',
  "if (engagementError || !liveEngagement) throw",
  "liveEngagement.assigned_to !== member.person_label",
  "if (!(liveEngagement.authorized_at || liveEngagement.accepted_at)",
  '.eq("id", task.id)',
  '.eq("case_id", row.id)',
  '.eq("state", task.state)',
  "if (taskError || !liveTask) throw",
  "state: task.state,",
]) assert.ok(taskLivePreflight.includes(guard),
  "task live authorization or stale-state guard missing: " + guard);


// Phase 3/4: creating a document request is a non-idempotent INSERT followed
// by an event INSERT. React's busy state is asynchronous; rapid clicks must
// not send two identical requests before the disabled button renders.
// This is a source-contract regression; DB-level idempotency and authenticated
// staging replay remain independent release gates.
const requestReplayBody = detail.src.split("async function createRequest() {")[1]
  ?.split("\n  async function toggleTask(")[0] ?? "";
assert.ok(detail.src.includes("const requestInFlight = useRef(false);"),
  "document-request creation needs a synchronous single-flight lock");
const requestLockCheck = requestReplayBody.indexOf("if (requestInFlight.current) return;");
const requestLockAcquire = requestReplayBody.indexOf("requestInFlight.current = true;");
const requestAuthAwait = requestReplayBody.indexOf("await db.auth.getUser()");
assert.ok(requestLockCheck >= 0 && requestLockCheck < requestLockAcquire &&
  requestLockAcquire < requestAuthAwait &&
  requestReplayBody.indexOf('const gate = allowed("request.create");') < requestLockAcquire,
  "request single-flight lock must be checked and acquired before the first async authorization step");
assert.ok(requestReplayBody.includes("finally {\n      requestInFlight.current = false;"),
  "request single-flight lock must be released after success and all failures");


// Phase 3/4: a client-visible or internal case note is a non-idempotent
// event INSERT. React busy state cannot prevent two rapid submissions
// before the next render; serialize within the mounted CaseDetail instance.
// This does not replace server-side idempotency or authenticated replay tests.
const noteReplayBody = detail.src.split("async function saveNote() {")[1]
  ?.split("\n  if (!session) {")[0] ?? "";
assert.ok(detail.src.includes("const noteInFlight = useRef(false);"),
  "note creation requires a synchronous single-flight lock");
const noteLockCheck = noteReplayBody.indexOf("if (noteInFlight.current) return;");
const noteLockAcquire = noteReplayBody.indexOf("noteInFlight.current = true;");
const noteAuthAwait = noteReplayBody.indexOf("await db.auth.getUser()");
assert.ok(noteLockCheck >= 0 && noteLockCheck < noteLockAcquire &&
  noteLockAcquire < noteAuthAwait &&
  noteReplayBody.indexOf('!allowed(noteClient ? "note.write_client" : "event.view_internal").ok') < noteLockAcquire,
  "note lock must be acquired only after capability checks and before async authorization");
assert.ok(noteReplayBody.includes("finally {\n      noteInFlight.current = false;"),
  "note lock must release after success and failure");


// Phase 3/4: case-stage decisions must not overlap in one mounted screen.
// Concurrent clicks can race preflight and create confusing success/failure
// outcomes even when the conditional database stage PATCH rejects a replay.
// This is a source-contract regression, not a substitute for DB transitions.
const stageSingleFlightBody = detail.src.split("async function move(to: CaseStage) {")[1]
  ?.split("\n  /**\n   * Accept or return one document.")[0] ?? "";
assert.ok(detail.src.includes("const stageInFlight = useRef(false);"),
  "case-stage transitions require a synchronous single-flight guard");
const stageLockCheck = stageSingleFlightBody.indexOf("if (stageInFlight.current) return;");
const stageLockAcquire = stageSingleFlightBody.indexOf("stageInFlight.current = true;");
const stageAuthAwait = stageSingleFlightBody.indexOf("await db.auth.getUser()");
assert.ok(stageLockCheck >= 0 &&
  stageLockCheck < stageLockAcquire &&
  stageLockAcquire < stageAuthAwait &&
  stageSingleFlightBody.indexOf("if (!result.ok)") < stageLockAcquire,
  "stage lock must reject overlapping actions, acquire after validation and before auth awaits");
assert.ok(stageSingleFlightBody.includes("finally {\n      stageInFlight.current = false;"),
  "stage lock must release after success, denied updates and failures");


// Phase 3/4: document acceptance and return are competing decisions on the
// same submitted request. React busy state is asynchronous and cannot prevent
// rapid opposing clicks from entering the live Auth preflight together.
// This mounted-screen guard complements the conditional database PATCH;
// it does not replace server idempotency or authenticated staging replay.
const reviewSingleFlightBody = detail.src.split('async function settleRequest(r: CaseRequest, to: "accepted" | "returned") {')[1]
  ?.split("\n  async function createRequest()")[0] ?? "";
assert.ok(detail.src.includes("const reviewInFlight = useRef(false);"),
  "document review requires a synchronous single-flight guard");
const reviewLockCheck = reviewSingleFlightBody.indexOf("if (reviewInFlight.current) return;");
const reviewLockAcquire = reviewSingleFlightBody.indexOf("reviewInFlight.current = true;");
const reviewAuthAwait = reviewSingleFlightBody.indexOf("await db.auth.getUser()");
assert.ok(reviewLockCheck >= 0 && reviewLockCheck < reviewLockAcquire &&
  reviewLockAcquire < reviewAuthAwait &&
  reviewSingleFlightBody.indexOf('if (to === "returned" && !reason)') < reviewLockAcquire &&
  reviewSingleFlightBody.indexOf('!allowed(to === "accepted" ? "document.review" : "request.return").ok') < reviewLockAcquire,
  "review lock must reject competing decisions and acquire only after capability and reason checks, before async Auth");
assert.ok(reviewSingleFlightBody.includes("finally {\n      reviewInFlight.current = false;"),
  "review lock must release after success, denied conditional updates and failures");


// Phase 3/4: task completion/reopening must not enter concurrent Auth checks
// from rapid clicks in one mounted CaseDetail screen. The conditional task
// PATCH remains the stale-state authority; this is only UI single-flight.
const taskSingleFlightBody = detail.src.split("async function toggleTask(task: CaseTask) {")[1]
  ?.split("\n  /** A note's audience")[0] ?? "";
assert.ok(detail.src.includes("const taskInFlight = useRef(false);"),
  "case task decisions require a synchronous single-flight guard");
const taskLockCheck = taskSingleFlightBody.indexOf("if (taskInFlight.current) return;");
const taskLockAcquire = taskSingleFlightBody.indexOf("taskInFlight.current = true;");
const taskAuthAwait = taskSingleFlightBody.indexOf("await db.auth.getUser()");
const taskCapabilityCheck = taskSingleFlightBody.indexOf('!allowed("case.advance").ok');
assert.ok(taskLockCheck >= 0 && taskLockCheck < taskLockAcquire &&
  taskCapabilityCheck >= 0 && taskCapabilityCheck < taskLockAcquire &&
  taskLockAcquire < taskAuthAwait,
  "task lock must reject overlapping actions and acquire after permission validation but before async Auth");
assert.ok(taskSingleFlightBody.includes("finally {\n      taskInFlight.current = false;"),
  "task lock must release on success, denied conditional update and failure");


// Phase 3/4: an in-flight task action must not write a previous case after
// navigation or an OTP member switch, or publish stale feedback/reload.
// Realtime refreshes within the same case must not invalidate the action.
assert.ok(detail.src.includes("const activeCaseIdRef = useRef(caseId);") &&
  detail.src.includes("activeCaseIdRef.current = caseId;"),
  "task actions need the currently rendered case identity");
assert.ok(taskSingleFlightBody.includes("activeCaseIdRef.current === actionCaseId") &&
  taskSingleFlightBody.includes("sessionMemberRef.current === actionMemberId"),
  "task action context must bind both case and firm member");
const taskContextGuard = taskSingleFlightBody.indexOf('if (!taskContextCurrent()) throw new Error("Case or firm session changed");');
const taskWrite = taskSingleFlightBody.indexOf('const written = await updateById("case_tasks"');
assert.ok(taskContextGuard >= 0 && taskContextGuard < taskWrite,
  "reject stale task actions before the conditional database write");
assert.ok(taskSingleFlightBody.includes("if (taskContextCurrent()) await load();"),
  "a previous case action must not trigger a late reload of its former case");
assert.ok(taskSingleFlightBody.includes("if (taskContextCurrent()) setFailed(task.id);") &&
  taskSingleFlightBody.includes("if (taskContextCurrent()) setBusy(null);"),
  "stale task completions must not overwrite the new case's feedback");


// Phase 3/4: a stage decision computed on an earlier case/member must not
// mutate that case after route navigation or a firm-session switch. The audit
// event for a successful write must still be attempted before skipping UI load.
assert.ok(stageSingleFlightBody.includes("const stageContextCurrent = () =>") &&
  stageSingleFlightBody.includes("activeCaseIdRef.current === actionCaseId") &&
  stageSingleFlightBody.includes("sessionMemberRef.current === actionMemberId"),
  "stage action must bind the rendered case and acting firm member");
const stageContextGuard = stageSingleFlightBody.indexOf('if (!stageContextCurrent()) throw new Error("Case or firm session changed");');
const stageConditionalWrite = stageSingleFlightBody.indexOf('const written = await updateById("compliance_cases"');
assert.ok(stageContextGuard >= 0 && stageContextGuard < stageConditionalWrite,
  "reject a stale stage action after async preflight and before the conditional write");
const stageAuditInsert = stageSingleFlightBody.indexOf('db.from("case_events").insert(result.events)');
const stageReload = stageSingleFlightBody.indexOf("if (stageContextCurrent()) await load();");
assert.ok(stageAuditInsert > stageConditionalWrite && stageReload > stageAuditInsert,
  "preserve stage audit insertion after successful writes even if navigation happened");
assert.ok(stageSingleFlightBody.includes("if (stageContextCurrent()) setFailed(to);") &&
  stageSingleFlightBody.includes("if (stageContextCurrent()) setBusy(null);") &&
  stageSingleFlightBody.includes("if (stageContextCurrent()) {\n          setFailed(to);"),
  "late stage outcomes must not overwrite the new case's failure or busy state");

// Phase 3/4: accepting or returning a document must not submit a former
// case's decision after asynchronous preflight crosses a route/member switch.
// A successful conditional write must still attempt its audit event, while
// late feedback, form clearing and reload are confined to the active case.
// This is a source-contract check, not an authenticated cross-tenant replay.
assert.ok(reviewSingleFlightBody.includes("const reviewContextCurrent = () =>") &&
  reviewSingleFlightBody.includes("activeCaseIdRef.current === actionCaseId") &&
  reviewSingleFlightBody.includes("sessionMemberRef.current === actionMemberId"),
  "document review must bind its original case and firm member");
const reviewContextGuard = reviewSingleFlightBody.indexOf('if (!reviewContextCurrent()) throw new Error("Case or firm session changed");');
const reviewConditionalWrite = reviewSingleFlightBody.indexOf('const written = await updateById("document_requests"');
assert.ok(reviewContextGuard >= 0 && reviewContextGuard < reviewConditionalWrite,
  "stale document decisions must be rejected before the conditional PATCH");
const reviewAuditInsert = reviewSingleFlightBody.indexOf('db.from("case_events").insert(event)');
const reviewContextReload = reviewSingleFlightBody.indexOf("if (reviewContextCurrent()) {\n        setReasons(");
assert.ok(reviewAuditInsert > reviewConditionalWrite && reviewContextReload > reviewAuditInsert &&
  reviewSingleFlightBody.includes("        await load();"),
  "a successful review must attempt audit insertion before any context-guarded UI reload");
assert.ok(reviewSingleFlightBody.includes("if (reviewContextCurrent()) {\n          setFailed(r.id);") &&
  reviewSingleFlightBody.includes("if (reviewContextCurrent()) setFailed(r.id);") &&
  reviewSingleFlightBody.includes("if (reviewContextCurrent()) setBusy(null);"),
  "late document review outcomes must not alter a new case's feedback");


// Phase 3/4: document-request creation must not submit a previous case's
// non-idempotent INSERT after asynchronous Auth/engagement checks cross a
// route or firm-member switch. Successful inserts still require audit events,
// even if the screen changes after the write. This is a source-contract test,
// not authenticated multi-tenant replay or database idempotency proof.
assert.ok(requestReplayBody.includes("const requestContextCurrent = () =>") &&
  requestReplayBody.includes("activeCaseIdRef.current === actionCaseId") &&
  requestReplayBody.includes("sessionMemberRef.current === actionMemberId"),
  "request creation must bind its original case and acting firm member");
const requestContextGuard = requestReplayBody.indexOf('if (!requestContextCurrent()) throw new Error("Case or firm session changed");');
const requestInsert = requestReplayBody.indexOf('db.from("document_requests").insert({');
assert.ok(requestContextGuard >= 0 && requestContextGuard < requestInsert &&
  requestContextGuard > requestReplayBody.indexOf("if (engagementError || !liveEngagement)"),
  "stale request creation must be rejected after live preflight but before INSERT");
const requestAuditInsert = requestReplayBody.indexOf('db.from("case_events").insert(event)');
const requestContextReload = requestReplayBody.indexOf('if (requestContextCurrent()) {\n        setAskFr("");');
assert.ok(requestAuditInsert > requestInsert && requestContextReload > requestAuditInsert &&
  requestReplayBody.includes("        await load();"),
  "successful request insert must attempt audit logging before guarded UI reset/reload");
assert.ok(requestReplayBody.includes('if (requestContextCurrent()) setFailed("new-request");') &&
  requestReplayBody.includes("if (requestContextCurrent()) setBusy(null);"),
  "late request creation must not overwrite another case's failure or busy state");
