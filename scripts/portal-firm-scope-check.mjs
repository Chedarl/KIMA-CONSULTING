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
    name + ": never resolve destination by arbitrary organization query");
  assert.ok(file.tables.includes("engagements"),
    name + ": must resolve under engagement RLS");
}
assert.match(thread.src, /\.eq\("taxpayer_id", taxpayerId\)/);
assert.match(thread.src, /\.in\("status", \["accepted", "authorized"\]\)/);
assert.match(thread.src, /\.is\("revoked_at", null\)/);
assert.match(thread.src, /sessionTaxpayerId\(/,
  "portal authenticates taxpayer before selecting a firm");
assert.match(thread.src, /setFirms\(liveIds\.map/,
  "all live engagements are available, not only the oldest");
assert.match(thread.src, /db\.rpc\("firm_directory"\)/,
  "recipient choices use the public name-only firm directory");
assert.match(thread.src, /setOrgId\(firms\.some/,
  "a taxpayer selects a firm explicitly when multiple are active");
assert.match(thread.src, /visibleMsgs = msgs\.filter/,
  "messages must be scoped to the chosen firm");
assert.match(thread.src, /visibleRequests = requests\.filter/,
  "document-request threads must be scoped to the chosen firm");
assert.match(thread.src, /chosenOrg/,
  "send must retain the recipient selection through authorization checks");
assert.match(thread.src, /current\.authorized_at \|\| current\.accepted_at/,
  "send must verify the selected engagement remains active");
assert.match(detail.src, /engagement\.id !== row\.engagement_id/);
assert.match(detail.src, /engagement\.taxpayer_id !== row\.taxpayer_id/);
assert.match(detail.src, /engagement\.revoked_at/);
assert.match(detail.src, /organization_id: orgId/);
console.log("ok portal/firm actions use active tenant engagements, never oldest organization");
