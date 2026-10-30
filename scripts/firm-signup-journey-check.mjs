// UI journey contract: pure-input negative tests and FR/EN parity.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const root = resolve(process.cwd());
const out = mkdtempSync(join(tmpdir(), "kima-signup-"));
const compiled = spawnSync(process.execPath, [join(root,"node_modules/typescript/bin/tsc"),
  "lib/firm-signup-journey.ts","lib/i18n-firm-signup.ts","lib/public-onboarding.ts",
  "--outDir",out,"--module","commonjs","--target","es2020",
  "--skipLibCheck","--moduleResolution","node","--esModuleInterop","--strict",
], {cwd:root, encoding:"utf8"});
assert.equal(compiled.status,0,compiled.stdout || compiled.stderr);
const require = createRequire(import.meta.url);
const m = require(join(out,"firm-signup-journey.js"));
const c = require(join(out,"i18n-firm-signup.js"));
const onboarding = require(join(out,"public-onboarding.js"));
const valid = {email:"OWNER@example.cm",firmName:"Cabinet Atelier",
  ownerName:"Aline Example",registrationNumber:" ab-12 / 34 "};
assert.deepEqual(m.firmSignupIssues(valid),[]);
assert.equal(m.canonicalRegistrationNumber(valid.registrationNumber),"AB-12/34");
for (const field of ["email","firmName","ownerName","registrationNumber"]) {
  const values = {email:"no@",firmName:" ",ownerName:"A",registrationNumber:"!!"};
  assert.ok(m.firmSignupIssues({...valid,[field]:values[field]}).includes(field),field);
}
assert.equal(m.signupRpcFailure("23505"),"duplicate");
assert.equal(m.signupRpcFailure("42501"),"disabled");
assert.equal(m.signupRpcFailure("22023"),"invalid_details");
assert.equal(m.signupRpcFailure("unexpected"),"failed");
const fr=c.getFirmSignupCopy("fr"),en=c.getFirmSignupCopy("en");
assert.deepEqual(Object.keys(fr).sort(),Object.keys(en).sort());
assert.deepEqual(Object.keys(fr.errors).sort(),Object.keys(en.errors).sort());
for(const t of [fr,en]){
  for(const value of Object.values(t.errors)) assert.ok(value.trim());
  assert.ok(t.pending && t.limitation && t.preview);
}
const applicant = { ...onboarding.EMPTY_ONBOARDING, kind:"business",
  name:"Synthetic Applicant", email:"synthetic@example.test",
  legalName:"Example Company", services:["tax"] };
assert.ok(onboarding.issuesFor("verify",applicant,true).includes("firm"));
assert.deepEqual(onboarding.issuesFor("verify",applicant),[]);
const assigned = { ...applicant, firmId:"00000000-0000-4000-8000-000000000001" };
assert.deepEqual(onboarding.issuesFor("verify",assigned,true),[]);
assert.equal(onboarding.registrationInsert(assigned,"00000000-0000-4000-8000-000000000010").full.organization_id,assigned.firmId);
console.log("ok firm signup validation, FR/EN, selected-firm queue");
