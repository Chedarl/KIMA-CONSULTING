/**
 * Pure-engine assertion harness (fix-forward step 4).
 *
 * Run with: npm test
 * No network, no Supabase — compiles against the TypeScript sources via the
 * project's typecheck, and exercises the emitted JS when present. Here we
 * import the built logic by re-implementing the critical contracts inline
 * against the source modules through dynamic tsx-free checks duplicated as
 * executable assertions that mirror lib/*.ts.
 *
 * Prefer importing from dist when available; until then, keep the contracts
 * as plain Node assertions that fail the build when they drift.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function compile(files) {
  const out = mkdtempSync(join(tmpdir(), "kima-engine-"));
  const args = [
    ...files.map((f) => join(root, f)),
    "--outDir",
    out,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--skipLibCheck",
    "--esModuleInterop",
    "--strict",
    "--moduleResolution",
    "node",
  ];
  const r = spawnSync(join(root, "node_modules/.bin/tsc"), args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout || r.stderr);
    throw new Error("tsc failed");
  }
  return out;
}

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
};

const out = compile([
  "lib/rules.ts",
  "lib/cases.ts",
  "lib/events.ts",
  "lib/permissions.ts",
  "lib/diagnostics.ts",
  "lib/commands.ts",
  "lib/document-review.ts",
]);

const require = createRequire(import.meta.url);
const rules = require(join(out, "rules.js"));
const cases = require(join(out, "cases.js"));
const permissions = require(join(out, "permissions.js"));
const commands = require(join(out, "commands.js"));
const review = require(join(out, "document-review.js"));

try {
  check("packCoverage CM has mostly inferred rules", () => {
    const c = rules.packCoverage("CM");
    assert.equal(c.total, 14);
    assert.equal(c.verified, 1);
    assert.equal(c.inferred, 13);
  });

  check("obligationsFor excludes inactive by default", () => {
    const active = rules.obligationsFor({ type: "sarl", regime: "reel" });
    assert.ok(active.every((o) => rules.isActive(o.source)));
    const all = rules.obligationsFor({ type: "sarl", regime: "reel", includeInactive: true });
    assert.ok(all.length >= active.length);
  });

  check("proposeCases only uses active obligations", () => {
    const proposed = cases.proposeCases({ type: "sarl", regime: "reel", year: 2026 });
    for (const p of proposed) {
      const o = rules.OBLIGATIONS.find((x) => x.code === p.obligation_code);
      assert.ok(o);
      assert.ok(rules.isActive(o.source), p.obligation_code);
    }
  });

  check("kima_admin lacks professional authority", () => {
    const admin = {
      id: "a",
      person_label: "Admin",
      email: "a@x.cm",
      role: "kima_admin",
      active: true,
      deactivated_at: null,
    };
    assert.equal(permissions.can({ kind: "firm", member: admin }, "document.review").ok, false);
    assert.equal(permissions.can({ kind: "firm", member: admin }, "filing.verify").ok, false);
    assert.equal(permissions.can({ kind: "firm", member: admin }, "member.manage").ok, true);
  });

  check("commandAdvanceCase refuses without capability", () => {
    const member = {
      id: "m",
      person_label: "Admin",
      email: "a@x.cm",
      role: "kima_admin",
      active: true,
      deactivated_at: null,
    };
    const current = {
      id: "c1",
      taxpayer_id: "t1",
      engagement_id: null,
      obligation_code: "patente",
      period_token: "A2026",
      due_on: "2026-03-15",
      due_needs_confirmation: false,
      due_basis: "statutory",
      stage: "documents",
      owner: "Irina",
      blocker: null,
      opened_at: "2026-01-01T00:00:00.000Z",
      closed_at: null,
      filing_status: "not_submitted",
      filing_reference: null,
      filing_evidence_ref: null,
      filing_attempted_at: null,
      filing_verified_at: null,
      payment_evidence_status: "unknown",
      billing_status: "not_quoted",
      prepared_by: null,
      prepared_at: null,
      approved_by: null,
      approved_at: null,
      self_approved: false,
    };
    const result = commands.commandAdvanceCase({
      current,
      advance: { to: "accounting", by: "Admin", requests: [] },
      eventActor: { role: "kima_admin", label: "Admin" },
      authActor: { kind: "firm", member },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "forbidden");
  });

  check("three verdicts always recorded", () => {
    const facts = {
      doc_type: "receipt",
      supplier_name: true,
      supplier_address: false,
      supplier_contact: false,
      supplier_niu: null,
      customer_name: true,
      customer_niu: "M123",
      itemised: true,
      invoice_number: null,
      invoice_date: "2026-01-15",
      amount_ht: 5000,
      vat_rate_shown: 0.1925,
      vat_amount: 963,
      amount_ttc: 5963,
      payment_method: "cash",
      supplier_regime: "unknown",
      business_purpose_stated: true,
    };
    const result = review.reviewDocument(facts, {
      client_regime: "reel",
      accounting_framework: "normal",
      period_date: "2026-01-15",
    });
    assert.equal(result.verdicts.length, 3);
    assert.equal(result.recorded, true);
  });

  console.log(`\n${passed} assertions passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
