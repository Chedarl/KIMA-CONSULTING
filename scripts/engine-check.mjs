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
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
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
  "lib/public-onboarding.ts",
  "lib/auth-mail.ts",
]);

const require = createRequire(import.meta.url);
const rules = require(join(out, "rules.js"));
const cases = require(join(out, "cases.js"));
const events = require(join(out, "events.js"));
const authMail = require(join(out, "auth-mail.js"));
const permissions = require(join(out, "permissions.js"));
const commands = require(join(out, "commands.js"));
const review = require(join(out, "document-review.js"));
const billing = require(join(out, "billing.js"));
const engagements = require(join(out, "engagements.js"));
const vault = require(join(out, "vault.js"));
const onboarding = require(join(out, "public-onboarding.js"));

try {
  check("packCoverage CM has mostly inferred rules", () => {
    const c = rules.packCoverage("CM");
    assert.equal(c.total, 14);
    assert.equal(c.verified, 1);
    assert.equal(c.inferred, 13);
  });

  check("obligationsFor excludes inactive by default", () => {
    const active = rules.obligationsFor({ type: "business_moral", regime: "reel" });
    assert.ok(active.every((o) => rules.isActive(o.source)));
    const all = rules.obligationsFor({ type: "business_moral", regime: "reel", includeInactive: true });
    // Non-vacuous: a valid type and regime reach real obligations, and the
    // inactive ones are really filtered out rather than never matched.
    assert.ok(all.length > active.length, "inactive obligations must exist and be excluded");
  });

  check("proposeCases only uses active obligations", () => {
    const proposed = cases.proposeCases({ type: "business_moral", regime: "reel", year: 2026 });
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
      billing_status: "quotation_pending",
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

  // -------------------------------------------------------------------------
  // P0 (security-and-integrity-review.md section 4, T-16 .. T-20)
  // -------------------------------------------------------------------------

  check("T-20 fixtures use valid enum values", () => {
    const types = new Set(rules.TAXPAYER_TYPES.map((t) => t.key));
    assert.ok(types.has("business_moral"));
    assert.ok(!types.has("sarl"), "sarl is a legal form, not a taxpayer type");
    assert.ok("quotation_pending" in cases.BILLING_LABELS);
    assert.ok(!("not_quoted" in cases.BILLING_LABELS));
    assert.ok("not_submitted" in cases.FILING_LABELS);
    assert.ok("unknown" in cases.PAYMENT_LABELS);
    assert.ok("documents" in cases.STAGE_LABELS);
  });

  check("T-16 CLIENT_EVENT_KINDS equals SQL client_may_record(), all client-visible", () => {
    const dir = join(root, "supabase", "migrations");
    // The latest migration that (re)defines the function is the one in force.
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    let sqlKinds = null;
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8");
      const m = sql.match(
        /function\s+client_may_record\s*\([\s\S]*?any\s*\(\s*array\s*\[([\s\S]*?)\]/i,
      );
      if (m) sqlKinds = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    }
    assert.ok(sqlKinds && sqlKinds.length > 0, "client_may_record() not found in migrations");
    assert.deepEqual([...sqlKinds].sort(), [...events.CLIENT_EVENT_KINDS].sort());
    // Not derived from visibility: client-WRITABLE is a strict subset of
    // client-VISIBLE. payment_verified is visible to the client and must never
    // be writable by one, so the two lists cannot be equal.
    const visible = new Set(events.clientVisibleKinds());
    assert.ok(events.CLIENT_EVENT_KINDS.length < visible.size, "writable list must be narrower than visible list");
    assert.ok(visible.has("payment_verified") && visible.has("filing_verified"));
    for (const k of events.CLIENT_EVENT_KINDS) {
      assert.ok(events.EVENT_KINDS[k], `${k} is not a known event kind`);
      assert.equal(events.EVENT_KINDS[k].clientVisible, true, `${k} must be client-visible`);
    }
    for (const k of ["filing_verified", "payment_verified", "fee_paid", "document_accepted", "stage_advanced"]) {
      assert.ok(!events.CLIENT_EVENT_KINDS.includes(k), `${k} must not be client-writable`);
    }
  });

  check("T-17 no stage x filing shows complete unless verified; abandoned never does", () => {
    const stages = Object.keys(cases.STAGE_LABELS);
    const filings = Object.keys(cases.FILING_LABELS);
    assert.ok(stages.length >= 8 && filings.length >= 5);
    for (const stage of stages) {
      for (const filing_status of filings) {
        for (const owed of [true, false]) {
          const s = cases.clientStatus({ stage, filing_status }, owed);
          assert.ok(s in cases.CLIENT_STATUS_LABELS, `${stage}/${filing_status} -> ${s}`);
          if (s === "complete") {
            assert.equal(filing_status, "verified", `${stage}/${filing_status} shown complete`);
          }
          if (stage === "abandoned") assert.notEqual(s, "complete");
          if (filing_status !== "verified") {
            assert.notEqual(s, "filing_verified", `${stage}/${filing_status} shown verified`);
          }
        }
      }
    }
    assert.equal(cases.clientStatus({ stage: "abandoned", filing_status: "verified" }, false), "closed");
    assert.equal(cases.clientStatus({ stage: "delivered", filing_status: "verified" }, false), "complete");
    assert.equal(cases.clientStatus({ stage: "filing", filing_status: "not_submitted" }, false), "not_yet_filed");
    for (const s of Object.keys(cases.CLIENT_STATUS_LABELS)) {
      const step = cases.clientStep(s);
      if (s === "closed") assert.equal(step, -1);
      else assert.ok(step >= 0 && step <= 4, `${s} -> ${step}`);
    }
    assert.equal(cases.clientStep("complete"), 4);
  });

  check("T-17 canDeliver only on a verified filing", () => {
    for (const filing_status of Object.keys(cases.FILING_LABELS)) {
      for (const payment_evidence_status of Object.keys(cases.PAYMENT_LABELS)) {
        assert.equal(
          cases.canDeliver({ filing_status, payment_evidence_status }),
          filing_status === "verified",
          `${filing_status}/${payment_evidence_status}`,
        );
      }
    }
  });

  check("T-18 a code is revealed only for an undeliverable address outside production", () => {
    const reveal = (revealFlag, vercelEnv, destination) =>
      authMail.mayRevealCode({ revealFlag, vercelEnv, destination });
    assert.equal(reveal("1", "preview", "amina@example.com"), true);
    assert.equal(reveal("1", undefined, "demo@demo.kima.cm"), true);
    assert.equal(reveal("1", "production", "amina@example.com"), false, "production");
    assert.equal(reveal("1", "preview", "amina@gmail.com"), false, "real address");
    assert.equal(reveal("1", "preview", "amina@kima.cm"), false, "real address");
    assert.equal(reveal("1", "preview", "amina@notexample.com"), false, "lookalike domain");
    assert.equal(reveal("1", "preview", "example.com@gmail.com"), false, "local part is not the domain");
    assert.equal(reveal(undefined, "preview", "amina@example.com"), false, "flag off");
    assert.equal(reveal("true", "preview", "amina@example.com"), false, "flag must be exactly 1");
  });

  check("T-19 a fee with only a reported payment is never Paid", () => {
    assert.equal(billing.feePaymentState(10000, { confirmed: 0, pending: 10000 }), "reported");
    assert.equal(billing.feePaymentState(10000, { confirmed: 4000, pending: 6000 }), "reported");
    assert.equal(billing.feePaymentState(10000, { confirmed: 4000, pending: 0 }), "due");
    assert.equal(billing.feePaymentState(10000, { confirmed: 10000, pending: 0 }), "paid");
    assert.equal(billing.feePaymentState(10000, { confirmed: 0, pending: 0 }), "due");
    for (let pending = 0; pending <= 20000; pending += 2500) {
      assert.notEqual(billing.feePaymentState(10000, { confirmed: 5000, pending }), "paid");
    }
  });

  // deliverOneTimeCode with a stubbed fetch: a send failure to a real address
  // is a failure, never a reveal, even with the flag on outside production.
  {
    const saved = {
      fetch: globalThis.fetch,
      key: process.env.RESEND_API_KEY,
      flag: process.env.KIMA_DEMO_OTP_REVEAL,
      env: process.env.VERCEL_ENV,
      err: console.error,
    };
    try {
      process.env.RESEND_API_KEY = "test-key";
      process.env.KIMA_DEMO_OTP_REVEAL = "1";
      process.env.VERCEL_ENV = "preview";
      console.error = () => {};
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response("boom", { status: 500 });
      };
      const failed = await authMail.deliverOneTimeCode({
        to: "amina@gmail.com", code: "12345678", locale: "fr", audience: "portal",
      });
      check("T-18 a failed send to a real address never reveals the code", () => {
        assert.equal(calls, 1);
        assert.equal(failed.delivered, "none");
        assert.equal(failed.reason, "send_failed");
        assert.ok(!("code" in failed));
      });

      process.env.VERCEL_ENV = "production";
      calls = 0;
      const prod = await authMail.deliverOneTimeCode({
        to: "amina@example.com", code: "12345678", locale: "en", audience: "firm",
      });
      check("T-18 production never reveals, even for an example.* address", () => {
        assert.equal(calls, 1);
        assert.equal(prod.delivered, "none");
      });

      delete process.env.RESEND_API_KEY;
      process.env.VERCEL_ENV = "preview";
      const unconfigured = await authMail.deliverOneTimeCode({
        to: "amina@gmail.com", code: "12345678", locale: "en", audience: "portal",
      });
      const demo = await authMail.deliverOneTimeCode({
        to: "demo@demo.kima.cm", code: "12345678", locale: "en", audience: "portal",
      });
      check("T-18 no mail configured: real address refused, demo address revealed", () => {
        assert.deepEqual(unconfigured, { delivered: "none", reason: "not_configured" });
        assert.deepEqual(demo, { delivered: "demo_reveal", code: "12345678" });
      });
    } finally {
      globalThis.fetch = saved.fetch;
      console.error = saved.err;
      for (const [k, v] of [
        ["RESEND_API_KEY", saved.key],
        ["KIMA_DEMO_OTP_REVEAL", saved.flag],
        ["VERCEL_ENV", saved.env],
      ]) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  check("public onboarding stays a private application", () => {
    const draft = {
      ...onboarding.EMPTY_ONBOARDING,
      kind: "business",
      name: "Amina Ngo",
      email: "amina@example.com",
      legalName: "Mbango Trading SARL",
      niu: "rc/yaoundé/b/1234",
      services: ["tax", "dsf"],
      language: "en",
    };
    assert.deepEqual(onboarding.issuesFor("verify", draft), []);
    assert.equal(onboarding.taxpayerTypeFor("accounting_firm"), "business_moral");
    assert.equal(onboarding.taxpayerTypeFor("individual"), "individual_pit");
    const row = onboarding.registrationInsert(draft, "11111111-1111-1111-1111-111111111111");
    assert.equal(row.base.taxpayer_type, "business_moral");
    assert.equal(row.base.declared_niu, "RCYAOUNDB1234");
    assert.equal(row.full.workspace_kind, "business");
    assert.equal(row.full.onboarding.isolation, "private_application");
    assert.equal(row.base.declared_regime, undefined);
    assert.equal(row.base.declared_centre, undefined);
    const thin = { ...draft, legalName: "A", services: [] };
    assert.ok(onboarding.issuesFor("verify", thin).includes("legalName"));
    assert.ok(onboarding.issuesFor("verify", thin).includes("services"));
    assert.equal(onboarding.inviteEmailIssue("not-an-email"), "inviteEmail");
    assert.equal(onboarding.inviteEmailIssue("a@b.co"), null);
  });

  check("accounting-firm workspaces are not offered until organisation scoping", () => {
    assert.deepEqual([...onboarding.OPEN_WORKSPACE_KINDS], ["individual", "business"]);
    assert.equal(onboarding.isOpenWorkspaceKind("accounting_firm"), false);
    assert.equal(onboarding.isOpenWorkspaceKind("business"), true);
    assert.equal(onboarding.isWorkspaceKind("accounting_firm"), true);
  });

  console.log(`\n${passed} assertions passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
