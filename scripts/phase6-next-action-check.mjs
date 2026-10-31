/** Phase 6: pure next-action regression tests with synthetic case records.
 * Run with: node scripts/phase6-next-action-check.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync("lib/incident-next-action.ts", "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
runInNewContext(code, { exports });
const { incidentView } = exports;
const base = {
  debitObserved: false,
  officialPaymentVerified: false,
  disputed: false,
  evidenceAttached: false,
  reviewerAssigned: false,
  supportReferencePresent: false,
};
const expectView = (changes, payment, next) => {
  const result = incidentView({ ...base, ...changes });
  assert.equal(result.paymentLabel, payment);
  assert.equal(result.nextAction, next);
  assert.ok(["attention", "normal"].includes(result.severity));
};
expectView({}, "not_verified", "assign_reviewer");
expectView({ debitObserved: true }, "not_verified", "attach_debit_evidence");
expectView({ debitObserved: true, evidenceAttached: true }, "not_verified", "assign_reviewer");
expectView({ debitObserved: true, evidenceAttached: true, reviewerAssigned: true }, "not_verified", "await_reviewer");
expectView({ debitObserved: true, evidenceAttached: true, reviewerAssigned: true, disputed: true }, "not_verified", "contact_official_support");
expectView({ debitObserved: true, evidenceAttached: true, reviewerAssigned: true, disputed: true, supportReferencePresent: true }, "not_verified", "await_reviewer");
expectView({ reviewerAssigned: true }, "not_verified", "request_official_evidence");
expectView({ officialPaymentVerified: true }, "officially_verified", "archive_verified");
expectView({ debitObserved: true, officialPaymentVerified: true }, "officially_verified", "archive_verified");
for (const debitObserved of [false, true]) {
  for (const evidenceAttached of [false, true]) {
    for (const disputed of [false, true]) {
      const value = incidentView({ ...base, debitObserved, evidenceAttached, disputed });
      assert.equal(value.paymentLabel, "not_verified",
        "Debit, evidence or dispute alone never confirms official payment");
    }
  }
}
console.log("ok Phase 6: synthetic incident safety and single-next-action cases");
