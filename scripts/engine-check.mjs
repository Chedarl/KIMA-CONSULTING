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
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

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
  const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
  const r = spawnSync(process.execPath, [tsc, ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout || r.stderr || r.error);
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
  "lib/billing.ts",
  "lib/engagements.ts",
  "lib/vault.ts",
]);

const require = createRequire(import.meta.url);
const rules = require(join(out, "rules.js"));
const cases = require(join(out, "cases.js"));
const permissions = require(join(out, "permissions.js"));
const commands = require(join(out, "commands.js"));
const review = require(join(out, "document-review.js"));
const billing = require(join(out, "billing.js"));
const engagements = require(join(out, "engagements.js"));
const vault = require(join(out, "vault.js"));

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

  check("nextFilingStatus is one legal forward step", () => {
    assert.equal(cases.nextFilingStatus("not_submitted"), "attempted");
    assert.equal(cases.nextFilingStatus("attempted"), "awaiting_verification");
    assert.equal(cases.nextFilingStatus("awaiting_verification"), "verified");
    assert.equal(cases.nextFilingStatus("correction_required"), "attempted");
    assert.equal(cases.nextFilingStatus("verified"), null);
    for (const from of ["not_submitted", "attempted", "awaiting_verification", "correction_required"]) {
      const to = cases.nextFilingStatus(from);
      const result = cases.recordFiling(
        { filing_status: from },
        { to, evidenceRef: to === "verified" ? "ACK-1" : null },
      );
      assert.equal(result.ok, true);
      assert.equal(result.patch.filing_status, to);
    }
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

  check("fee ledger derives balances and confirms only with a reference", () => {
    const payments = [
      { invoice_id: "a", amount_minor: 5000, status: "confirmed", provider_reference: "MM1" },
      { invoice_id: "a", amount_minor: 2000, status: "pending_confirmation", provider_reference: null },
      { invoice_id: "a", amount_minor: 9000, status: "rejected", provider_reference: null },
    ];
    const bal = billing.ledgerBalance(payments, "a");
    assert.equal(bal.confirmed, 5000);
    assert.equal(bal.pending, 2000);
    assert.equal(billing.outstandingMinor(10000, bal), 3000);
    const pending = { status: "pending_confirmation", provider_reference: null };
    assert.equal(billing.reviewServicePayment(pending, { to: "confirmed", by: "Irina" }).ok, false);
    const confirmed = billing.reviewServicePayment(pending, {
      to: "confirmed",
      by: "Irina",
      reference: "REC-9",
      at: "2026-10-23T08:00:00.000Z",
    });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.patch.status, "confirmed");
    assert.equal(confirmed.patch.provider_reference, "REC-9");
    assert.equal(confirmed.patch.confirmed_by, "Irina");
    const rejected = billing.reviewServicePayment(pending, { to: "rejected", by: "Irina" });
    assert.equal(rejected.ok, true);
    assert.equal(rejected.patch.status, "rejected");
    assert.equal(
      billing.reviewServicePayment(
        { status: "confirmed", provider_reference: "REC-9" },
        { to: "rejected", by: "Irina" },
      ).reason,
      "not_pending",
    );
    assert.equal(
      billing.feeOverdue(
        { id: "a", taxpayer_id: "t", number: "K-1", total_minor: 10000, status: "issued", due_on: "2026-10-01" },
        "2026-10-23",
        5000,
      ),
      true,
    );
  });

  check("engagement writes the timestamps authorityCheck reads", () => {
    const draft = engagements.draftEngagement({
      taxpayerId: "tp",
      serviceCode: "VAT",
      feeXaf: 7500,
      scopeNote: "TVA mensuelle",
    });
    assert.equal(draft.ok, true);
    assert.equal(draft.row.status, "pending");
    assert.equal(draft.row.authorized_at, null);
    assert.equal(draft.row.fee_xaf, 7500);
    assert.equal(engagements.draftEngagement({ taxpayerId: "tp", feeXaf: 1.5 }).reason, "fee_invalid");
    assert.equal(engagements.engagementPosture(draft.row), "awaiting_authorisation");

    const authorised = engagements.authorizeEngagement(draft.row, "2026-10-23T09:00:00.000Z");
    assert.equal(authorised.ok, true);
    assert.equal(authorised.patch.status, "authorized");
    assert.equal(authorised.event.kind, "engagement_authorized");
    assert.equal(authorised.event.to, "authorized");
    const row = { ...draft.row, ...authorised.patch, scope_note: "TVA mensuelle", service_code: "VAT" };
    assert.equal(engagements.engagementPosture(row), "authorised");
    assert.equal(engagements.authorizeEngagement(row).reason, "already_authorised");

    assert.equal(engagements.revokeEngagement(row, "  ").reason, "reason_required");
    const revoked = engagements.revokeEngagement(row, "Le client retire le mandat", "2026-10-23T10:00:00.000Z");
    assert.equal(revoked.ok, true);
    assert.equal(revoked.patch.status, "revoked");
    assert.equal(revoked.event.reason, "Le client retire le mandat");
    assert.equal(revoked.event.to, "revoked");
    assert.equal("authorized_at" in revoked.patch, false);
    assert.equal(engagements.engagementPosture({ ...row, ...revoked.patch }), "revoked");
    assert.equal(engagements.authorizeEngagement({ ...row, ...revoked.patch }).reason, "already_revoked");
  });

  check("vault keeps accepted evidence and verified filings apart from the inbox", () => {
    assert.equal(vault.acceptedIntoVault({ review_status: "accepted" }), true);
    assert.equal(vault.acceptedIntoVault({ review_status: "pending" }), false);
    assert.equal(vault.acceptedIntoVault({ review_status: "returned" }), false);
    assert.equal(vault.filingEvidence({ filing_status: "verified", filing_evidence_ref: "ACK-1" }), true);
    assert.equal(vault.filingEvidence({ filing_status: "verified", filing_evidence_ref: "  " }), false);
    assert.equal(vault.filingEvidence({ filing_status: "attempted", filing_evidence_ref: "ACK-1" }), false);
  });

  console.log(`\n${passed} assertions passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
