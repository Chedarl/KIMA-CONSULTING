/** Phase 6 synthetic packet disclosure check.
 * Run: node scripts/phase6-support-packet-check.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync("lib/incident-support-packet.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
runInNewContext(compiled, { exports });
const { buildIncidentSupportPacket } = exports;
const example = {
  id: "SYNTH-INC-1", type: "debit_not_recognised", status: "open",
  observedAt: "2026-10-31T12:00:00+01:00", payment: "debit_observed",
  referenceMasked: "SYNTH-PRIVATE-ABC7",
  evidence: [{ id: "EV-1", kind: "debit_sms", capturedAt: "2026-10-31T12:00:00+01:00",
    label: "DO-NOT-LEAK-FILE-NAME", addedBy: "taxpayer" }],
  contacts: [{ id: "CT-1", at: "2026-10-31T12:00:00+01:00", channel: "phone",
    counterparty: "DO-NOT-LEAK-CONTACT", ticketMasked: "PRIVATE-TICKET-9876",
    response: "DO-NOT-LEAK-RESPONSE", unresolved: "DO-NOT-LEAK-DETAIL",
    recordedBy: "taxpayer" }],
  events: [{ at: "2026-10-31T12:00:00+01:00", kind: "incident_reported",
    actorRole: "taxpayer", actorLabel: "DO-NOT-LEAK-ACTOR",
    basis: "declared", from: null, to: null, evidenceIds: [],
    note: "DO-NOT-LEAK-NOTE" }],
};
const packet = buildIncidentSupportPacket(example);
assert.equal(packet.incidentId, "SYNTH-INC-1");
assert.equal(packet.paymentState, "debit_observed");
assert.equal(packet.transactionReferenceMasked, "•••• ABC7");
assert.equal(packet.contacts[0].ticketMasked, "•••• 9876");
assert.equal(packet.timeline.length, 1);
assert.equal(packet.timeline[0].basis, "declared");
assert.ok(packet.disclaimer.fr.length && packet.disclaimer.en.length);
const serialized = JSON.stringify(packet);
for (const secret of ["PRIVATE", "DO-NOT-LEAK", "ABC7-PRIVATE", "CONTACT"]) {
  assert.ok(!serialized.includes(secret), `Unexpected disclosure: ${secret}`);
}
assert.ok(!serialized.includes("officially_verified"));
assert.equal(buildIncidentSupportPacket({ ...example, referenceMasked: null, contacts: [] })
  .transactionReferenceMasked, null);
console.log("ok Phase 6: synthetic support packet redaction and payment-state checks");
