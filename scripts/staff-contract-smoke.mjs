// Phase 2: fail-first contract for the bilingual staff RPC adapter.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const adapter = join(root, "lib/firm-staff.ts");
assert.ok(existsSync(adapter), "firm staff adapter is missing");
const code = readFileSync(adapter, "utf8");
assert.ok(code.includes('rpc("manage_firm_staff"'), "writes must use the staff RPC");
for (const action of ["inviteStaff", "setStaffRole", "revokeStaff"]) {
  assert.ok(code.includes("export const " + action), action + " is missing");
}
assert.ok(code.includes("STAFF_REFUSAL_SIGNATURES"), "RPC refusals need explicit translations");
const dictionary = readFileSync(join(root, "lib/i18n-workspace.ts"), "utf8");
assert.equal(dictionary.split("staffPage: {").length - 1, 2, "FR and EN staff copy required");
for (const label of ["noEmailSent", "partnerNotAssignable", "notPartner", "roleFirmReviewer"]) {
  assert.equal(dictionary.split(label + ":").length - 1, 2, label + " must exist in both locales");
}
console.log("staff adapter and bilingual copy contract passed");
