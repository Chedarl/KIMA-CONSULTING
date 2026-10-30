/** Offline Q-2 behavior check; transpiles only synthetic TypeScript mock. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync("lib/mocks/phase3-invitations.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const ctx = { exports: {} };
runInNewContext(compiled, ctx, { filename: "phase3-invitations.mock.js" });
const { demoOwner, demoPartners, demoFirms, demoCompanies,
  previewInvitationAcceptance: preview, previewAccessibleCompanies: accessible } = ctx.exports;
assert.equal(demoOwner.owned_companies.length, 2);
assert.equal(demoFirms.length, 2);
assert.equal(demoCompanies.length, 2);
assert.notEqual(demoCompanies[0].niu, demoCompanies[1].niu);
const assignments = [
  { firm_id: "firm-a", taxpayer_id: "company-a" },
  { firm_id: "firm-b", taxpayer_id: "company-b" },
];
assert.deepEqual([...accessible(demoPartners[0], assignments)], ["company-a"]);
assert.deepEqual([...accessible(demoPartners[1], assignments)], ["company-b"]);
assert.deepEqual([...accessible(demoOwner, assignments)].sort(), ["company-a", "company-b"]);
const a = {
  id: "inv-a", direction: "firm_to_taxpayer", status: "pending",
  firm_id: "firm-a", taxpayer_id: "company-a", recipient_email: "owner@example.test",
  expires_at: "2026-11-13T20:00:00Z",
};
const now = "2026-10-30T20:00:00Z";
assert.equal(preview(a, demoOwner, now).ok, true);
assert.equal(preview(a, demoPartners[0], now).code, "wrong_recipient");
assert.equal(preview(a, null, now).code, "not_authenticated");
assert.equal(preview(a, demoOwner, "2026-11-13T20:00:00Z").code, "expired");
assert.equal(preview({ ...a, status: "revoked" }, demoOwner, now).code, "already_decided");
assert.equal(preview({ ...a, taxpayer_id: "company-other" }, demoOwner, now).code, "wrong_recipient");
const b = {
  id: "inv-b", direction: "taxpayer_to_firm", status: "pending",
  firm_id: "firm-b", taxpayer_id: "company-b", recipient_email: "b@example.test",
  expires_at: "2026-11-13T20:00:00Z",
};
assert.equal(preview(b, demoPartners[1], now).ok, true);
assert.equal(preview(b, demoPartners[0], now).code, "forbidden");
console.log("ok Q-2: synthetic, company-scoped invitations and negative identity cases");
