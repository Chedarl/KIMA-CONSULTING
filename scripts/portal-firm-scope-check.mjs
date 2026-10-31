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

console.log("ok: live engagement recipient selector and case-scoped tenant routing");

// Token refresh must preserve current identity, pending work and visible data.
assert.match(service.src, /event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED"/);
assert.match(service.src, /if \(nextUserId === identityRef\.current\) return;/);
