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
// The thread itself must bind a supplied OTP member to the current Auth user
// on both read and send. Parent workspace checks alone cannot protect a
// separately mounted thread or a stale member identity.
const firmThreadLoad = thread.src.split("  const load = useCallback(async () => {")[1]?.split("\n  useEffect(() => {")[0] ?? "";
const firmThreadSend = thread.src.split("  async function send(")[1]?.split("\n  if (!taxpayerId) return")[0] ?? "";
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
assert.match(service.src, /if \(caseStamp !== caseId\) \{\n    setCaseStamp\(caseId\);\n    setBusy\(null\);\n    setFailed\(null\);\n    pending\.current = null;\n  \}/,
  "switching cases must clear approval busy, failure, and pending state before paint");

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
