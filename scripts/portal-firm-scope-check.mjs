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
console.log("ok: live engagement recipient selector and case-scoped tenant routing");
