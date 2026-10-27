/**
 * Journey checks for the incident-recovery prototype (Agent B).
 *
 * Run with: npm run test:journey
 * No network, no Supabase. Compiles lib/incidents.ts, lib/next-best-action.ts
 * and lib/mocks/incidents.ts with tsc (the same way scripts/engine-check.mjs
 * does) and asserts the rules from docs/strategy/2026-10-27-taxpayer-first/
 * test-protocol.md: A-2, A-7, A-8, plus "a taxpayer can never set verified or
 * resolved". Acceptance IDs are in agent-b/acceptance-tests.md.
 *
 * Every check counts its own assertions, so a vacuous pass shows up as 0.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function compile(files) {
  const out = mkdtempSync(join(tmpdir(), "kima-journey-"));
  const args = [
    ...files.map((f) => join(root, f)),
    "--outDir",
    out,
    "--rootDir",
    join(root, "lib"),
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

let checks = 0;
let assertions = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  assertions += 1;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  assertions += 1;
};
const check = (name, fn) => {
  const before = assertions;
  fn();
  const n = assertions - before;
  if (n === 0) throw new Error(`${name}: no assertions ran`);
  checks += 1;
  console.log(`ok  ${name} (${n} assertions)`);
};

const out = compile(["lib/incidents.ts", "lib/next-best-action.ts", "lib/mocks/incidents.ts"]);
const require = createRequire(import.meta.url);
const inc = require(join(out, "incidents.js"));
const nba = require(join(out, "next-best-action.js"));
const mocks = require(join(out, "mocks", "incidents.js"));
if (!existsSync(join(out, "mocks", "incidents.js"))) throw new Error("mocks not compiled");

const T = mocks.TAXPAYER_ACTOR;
const R = mocks.REVIEWER_ACTOR;
const R_NO_CRED = { role: "reviewer", label: "Uncredentialed", credential: null };
const AT = "2026-10-27T10:00:00+01:00";

/** A blank incident in a given payment / status, with optional evidence. */
const blank = (payment, status = "open", evidence = [], type = "debit_not_recognised") => ({
  id: "INC-TEST",
  type,
  status,
  observedAt: AT,
  amountMinor: null,
  portalKey: null,
  attemptedStep: null,
  reportedError: null,
  payment,
  referenceMasked: null,
  evidence,
  contacts: [],
  resolution: null,
  verifiedBy: null,
  verifiedAt: null,
  events: [],
});
const ev = (id, kind) => ({ id, kind, label: `${id}-synthetic`, capturedAt: AT, addedBy: "taxpayer" });
const RECEIPT = ev("E-R", "official_receipt");
const SMS = ev("E-S", "debit_sms");
const STATEMENT = ev("E-B", "bank_statement");

const actors = [T, R, R_NO_CRED];
const evidenceSets = [[], [SMS], [SMS, STATEMENT], [RECEIPT], [SMS, RECEIPT]];
const citeSets = (evs) => [undefined, [], evs.map((e) => e.id), ["missing-id"]];

try {
  // -------------------------------------------------------------------------
  // A-2 — verified needs evidence; a debit alone never reaches verified
  // -------------------------------------------------------------------------
  check("A-2a recordPayment(verified) without evidence is refused, from every state, for every actor", () => {
    for (const p of inc.PAYMENT_STATES) {
      for (const a of actors) {
        for (const ids of [undefined, []]) {
          const r = inc.recordPayment(blank(p, "open", [SMS, RECEIPT]), { to: "verified", actor: a, evidenceIds: ids, at: AT });
          ok(!r.ok, `${p} → verified by ${a.label} with ${JSON.stringify(ids)} must be refused`);
        }
      }
    }
  });

  check("A-2b debit evidence (SMS, statement, screenshot) never verifies a payment", () => {
    for (const p of ["reference_recorded", "disputed"]) {
      for (const evs of [[SMS], [STATEMENT], [ev("E-W", "wallet_screenshot")], [ev("E-P", "portal_screenshot")], [SMS, STATEMENT]]) {
        const r = inc.recordPayment(blank(p, "open", evs), { to: "verified", actor: R, evidenceIds: evs.map((e) => e.id), at: AT });
        eq(r.ok, false, `${p} verified on ${evs.map((e) => e.kind)} must be refused`);
        eq(r.reason, "official_evidence_required");
      }
    }
  });

  check("A-2c debit_observed has no edge to verified, even with an official receipt and a credentialed reviewer", () => {
    ok(!inc.PAYMENT_FLOW.debit_observed.includes("verified"), "graph must not contain debit_observed → verified");
    const r = inc.recordPayment(blank("debit_observed", "open", [RECEIPT]), { to: "verified", actor: R, evidenceIds: [RECEIPT.id], at: AT });
    eq(r.ok, false);
    eq(r.reason, "not_allowed");
  });

  check("A-2d exhaustive: no sequence of taxpayer acts from unknown reaches verified (BFS over the graph)", () => {
    const seen = new Set(["unknown"]);
    const queue = ["unknown"];
    while (queue.length) {
      const p = queue.shift();
      for (const to of inc.PAYMENT_STATES) {
        const r = inc.recordPayment(blank(p, "open", [SMS, RECEIPT]), { to, actor: T, evidenceIds: [SMS.id, RECEIPT.id], at: AT });
        if (r.ok && !seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    ok(!seen.has("verified"), `taxpayer reached: ${[...seen].join(", ")}`);
    ok(seen.has("debit_observed") && seen.has("reference_recorded"), "taxpayer can still declare debit and reference");
  });

  check("A-2e the only accepted verification: credentialed reviewer + official receipt from reference_recorded or disputed", () => {
    for (const p of ["reference_recorded", "disputed"]) {
      const r = inc.recordPayment(blank(p, "open", [SMS, RECEIPT]), { to: "verified", actor: R, evidenceIds: [RECEIPT.id], at: AT });
      ok(r.ok, `${p} → verified with receipt must succeed`);
      eq(r.incident.payment, "verified");
      eq(r.incident.verifiedBy, R.label);
      const last = r.incident.events.at(-1);
      eq([last.basis, last.actorRole, last.evidenceIds], ["verified", "reviewer", [RECEIPT.id]]);
    }
    const noCred = inc.recordPayment(blank("reference_recorded", "open", [RECEIPT]), { to: "verified", actor: R_NO_CRED, evidenceIds: [RECEIPT.id], at: AT });
    eq(noCred.reason, "reviewer_not_credentialed");
  });

  // -------------------------------------------------------------------------
  // Taxpayer can never set verified or resolved
  // -------------------------------------------------------------------------
  check("T-V taxpayer can never set payment verified, from any state, with any evidence", () => {
    for (const p of inc.PAYMENT_STATES) {
      for (const evs of evidenceSets) {
        for (const ids of citeSets(evs)) {
          for (const status of inc.INCIDENT_STATUSES) {
            const r = inc.recordPayment(blank(p, status, evs), { to: "verified", actor: T, evidenceIds: ids, at: AT });
            ok(!r.ok, `taxpayer ${p} → verified (${status}) must be refused`);
          }
        }
      }
    }
  });

  check("T-R taxpayer can never resolve or close an incident, from any status, with any evidence", () => {
    for (const s of inc.INCIDENT_STATUSES) {
      for (const p of inc.PAYMENT_STATES) {
        for (const evs of evidenceSets) {
          for (const ids of citeSets(evs)) {
            for (const to of ["resolved", "closed_unresolved"]) {
              const r = inc.setIncidentStatus(blank(p, s, evs), {
                to,
                actor: T,
                evidenceIds: ids,
                resolution: { outcome: "payment_confirmed", reason: "taxpayer says so" },
                at: AT,
              });
              ok(!r.ok, `taxpayer ${s} → ${to} must be refused`);
            }
          }
        }
      }
    }
  });

  check("T-S taxpayer UI offers no verify or resolve control (offered targets)", () => {
    for (const p of inc.PAYMENT_STATES) {
      for (const s of inc.INCIDENT_STATUSES) {
        const i = blank(p, s);
        ok(!inc.offeredPaymentTargets(i, T).includes("verified"), `offered verified to taxpayer at ${p}`);
        ok(!inc.offeredPaymentTargets(i, T).includes("disputed"), `offered disputed to taxpayer at ${p}`);
        const st = inc.offeredIncidentTargets(i, T);
        ok(!st.includes("resolved") && !st.includes("closed_unresolved"), `offered resolve to taxpayer at ${s}`);
      }
    }
  });

  check("T-D every taxpayer act is recorded as declared", () => {
    const i = blank("unknown");
    const a = inc.recordPayment(i, { to: "debit_observed", actor: T, at: AT });
    const b = inc.recordReference(a.incident, { reference: "SYNTH-REF-0000", actor: T, at: AT });
    const c = inc.addEvidence(b.incident, { evidence: { id: "E-1", kind: "debit_sms", label: "x", capturedAt: AT }, actor: T, at: AT });
    const d = inc.logContact(c.incident, {
      contact: { id: "C-1", at: AT, channel: "phone", counterparty: "synthetic", ticketMasked: null, response: null, unresolved: null },
      actor: T,
    });
    ok(a.ok && b.ok && c.ok && d.ok, "all four taxpayer acts succeed");
    ok(d.incident.events.length >= 5, "events appended");
    for (const e of d.incident.events) eq(e.basis, "declared", `${e.kind} must be declared`);
    eq(d.incident.payment, "reference_recorded");
    eq(d.incident.status, "awaiting_administration");
    eq(d.incident.referenceMasked, "•••• 0000");
    ok(!JSON.stringify(d.incident).includes("SYNTH-REF-0000"), "full reference must not be kept");
  });

  check("T-X resolving a debit incident needs a verified payment, official evidence and a reason", () => {
    const base = blank("reference_recorded", "awaiting_administration", [SMS, RECEIPT]);
    const res = { outcome: "payment_confirmed", reason: "receipt checked" };
    eq(inc.setIncidentStatus(base, { to: "resolved", actor: R, evidenceIds: [RECEIPT.id], resolution: res, at: AT }).reason, "payment_not_verified");
    const paid = inc.recordPayment(base, { to: "verified", actor: R, evidenceIds: [RECEIPT.id], at: AT }).incident;
    eq(inc.setIncidentStatus(paid, { to: "resolved", actor: R, evidenceIds: [SMS.id], resolution: res, at: AT }).reason, "official_evidence_required");
    eq(inc.setIncidentStatus(paid, { to: "resolved", actor: R, evidenceIds: [RECEIPT.id], at: AT }).reason, "reason_required");
    const done = inc.setIncidentStatus(paid, { to: "resolved", actor: R, evidenceIds: [RECEIPT.id], resolution: res, at: AT });
    ok(done.ok, "resolution succeeds with everything");
    eq(done.incident.events.at(-1).basis, "verified");
    eq(inc.recordPayment(done.incident, { to: "disputed", actor: R, at: AT }).reason, "closed");
  });

  // -------------------------------------------------------------------------
  // A-7 / A-8 — next best action
  // -------------------------------------------------------------------------
  const certs = ["not_requested", "requested", "blocked", "obtained", "expired"];
  const types = ["payment_step_error", "debit_not_recognised", "certificate_blocked"];
  const contactsSets = [[], [{ id: "C", at: AT, channel: "phone", counterparty: "x", ticketMasked: null, response: null, unresolved: null, recordedBy: "taxpayer" }]];

  /** Every combination the engine can see, plus the four fixtures. */
  function* allInputs() {
    for (const view of ["taxpayer", "reviewer"]) {
      for (const payment of inc.PAYMENT_STATES) {
        for (const certificate of certs) {
          yield { view, incident: null, payment, certificate };
          for (const status of inc.INCIDENT_STATUSES) {
            for (const type of types) {
              for (const evidence of evidenceSets) {
                for (const contacts of contactsSets) {
                  for (const referenceMasked of [null, "•••• 0000"]) {
                    yield { view, payment, certificate, incident: { ...blank(payment, status, evidence, type), contacts, referenceMasked } };
                  }
                }
              }
            }
          }
        }
      }
    }
    for (const f of mocks.FIXTURES) {
      for (const view of ["taxpayer", "reviewer"]) {
        yield { view, incident: f.incident, payment: f.payment, certificate: f.certificate };
      }
    }
  }

  const PAY_WORDS = /\b(pay again|pay now|repay|re-pay|pay the tax|retry (the )?payment|payez|payer|repayer|réglez|régler|nouveau paiement|paiement à nouveau)\b/i;

  check("A-7 nextBestAction returns exactly one action, each with a verified source or the bilingual fallback", () => {
    let n = 0;
    for (const input of allInputs()) {
      const a = nba.nextBestAction(input);
      ok(a && !Array.isArray(a) && typeof a.id === "string", "exactly one action object");
      ok(a.title.fr.trim() && a.title.en.trim() && a.why.fr.trim() && a.why.en.trim(), `${a.id} bilingual`);
      eq(a.audience, input.view);
      const s = a.source;
      if (s.status === "verified") {
        ok(s.kind === "kima_policy" && s.ref.trim() && s.label.fr.trim() && s.label.en.trim(), `${a.id} verified source has ref and label`);
      } else {
        eq(s.status, "not_yet_confirmed");
        eq(s.fallback, nba.NOT_YET_CONFIRMED);
      }
      n += 1;
    }
    ok(n > 1000, `enumerated ${n} inputs`);
    eq(nba.NOT_YET_CONFIRMED.en, "Not yet confirmed — ask your tax centre");
  });

  check("A-7b actions that depend on the administration always carry the fallback (no invented procedure)", () => {
    const adminActions = new Set(["ask_for_receipt", "wait_for_answer", "ask_about_certificate", "reviewer_follow_dispute"]);
    const digits = /\d{3,}/; // no phone numbers, amounts or dates in guidance
    for (const input of allInputs()) {
      const a = nba.nextBestAction(input);
      if (adminActions.has(a.id)) eq(a.source.status, "not_yet_confirmed", `${a.id} must use the fallback`);
      for (const text of [a.title.fr, a.title.en, a.why.fr, a.why.en]) ok(!digits.test(text), `${a.id} text contains a number: ${text}`);
    }
  });

  check("A-8 never suggests paying again while payment is debit_observed, reference_recorded or disputed", () => {
    let held = 0;
    for (const input of allInputs()) {
      const a = nba.nextBestAction(input);
      eq(a.suggestsPayment, false);
      const p = input.incident ? input.incident.payment : input.payment;
      for (const text of [a.title.fr, a.title.en, a.why.fr, a.why.en]) ok(!PAY_WORDS.test(text), `${a.id}: "${text}"`);
      if (["debit_observed", "reference_recorded", "disputed"].includes(p) && input.incident && input.incident.status !== "resolved" && input.incident.type !== "certificate_blocked") {
        ok(a.doNotPayAgain || a.audience === "reviewer", `${a.id} at ${p} must carry the do-not-pay-again warning`);
        held += 1;
      }
    }
    ok(held > 100, `held-debit cases checked: ${held}`);
    ok(/second time|seconde fois/.test(nba.DO_NOT_PAY_AGAIN.en + nba.DO_NOT_PAY_AGAIN.fr), "warning text present");
  });

  // -------------------------------------------------------------------------
  // Fixtures F-1 … F-4
  // -------------------------------------------------------------------------
  check("F fixtures are synthetic and consistent with the engine", () => {
    eq(mocks.FIXTURES.map((f) => f.id), ["F-1", "F-2", "F-3", "F-4"]);
    const blob = JSON.stringify(mocks.FIXTURES);
    ok(!/\b[MP]\d{12}[A-Z]\b/.test(blob), "no NIU-shaped string");
    ok(/fictif|synthetic/i.test(mocks.FIXTURES[0].taxpayer.name), "taxpayer labelled synthetic");
    eq(mocks.fixture("F-1").incident, null);
    eq(mocks.fixture("F-2").incident.type, "payment_step_error");
    eq(mocks.fixture("F-3").incident.contacts.length, 2);
    eq(mocks.fixture("F-3").incident.payment, "reference_recorded");
    eq(mocks.fixture("F-4").certificate, "blocked");
    for (const f of mocks.FIXTURES) {
      const i = f.incident;
      if (!i) continue;
      for (const e of i.events) if (e.actorRole === "taxpayer") eq(e.basis, "declared", `${f.id} ${e.kind}`);
      if (i.payment === "verified") {
        const v = i.events.find((e) => e.kind === "payment_changed" && e.to === "verified");
        ok(v && v.actorRole === "reviewer" && v.basis === "verified", `${f.id} verified by a reviewer event`);
        ok(v.evidenceIds.some((id) => inc.isOfficialEvidence(i.evidence.find((x) => x.id === id).kind)), `${f.id} cites official evidence`);
      }
      if (i.referenceMasked) ok(/^•••• .{4}$/.test(i.referenceMasked), `${f.id} reference masked`);
    }
    // The four fixtures, as the taxpayer sees them.
    eq(nba.nextBestAction({ view: "taxpayer", incident: null, payment: "unknown", certificate: "not_requested" }).id, "record_what_happened");
    const f2 = mocks.fixture("F-2");
    eq(nba.nextBestAction({ view: "taxpayer", incident: f2.incident, payment: f2.payment, certificate: f2.certificate }).id, "check_for_debit");
    const f3 = mocks.fixture("F-3");
    const a3 = nba.nextBestAction({ view: "taxpayer", incident: f3.incident, payment: f3.payment, certificate: f3.certificate });
    eq([a3.id, a3.doNotPayAgain], ["wait_for_answer", true]);
    const f4 = mocks.fixture("F-4");
    eq(nba.nextBestAction({ view: "taxpayer", incident: f4.incident, payment: f4.payment, certificate: f4.certificate }).source.status, "not_yet_confirmed");
  });

  console.log(`\n${checks} checks, ${assertions} assertions passed.`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
