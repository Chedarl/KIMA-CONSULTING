# F — Test protocol

Two layers: **automated** checks that the product cannot lie (run in CI on every PR), and a
**comprehension** protocol with people (run before any claim that KIMA helps). Role-play
results are never reported as user evidence.

## 1. Synthetic fixtures

All data synthetic and labelled (R-32). One taxpayer, three cases.

| Fixture | Taxpayer | Case | Starting state |
|---|---|---|---|
| F-1 | Boutique Ndolo (synthetic), IGS, CDI Douala (all `declared`) | IGS, 2026-Q3 | filing `not_submitted`, payment `unknown`, no incident |
| F-2 | same | IGS, 2026-Q3 | filing `attempted`; incident `payment_step_error` open; screenshot (synthetic) attached |
| F-3 | same | IGS, 2026-Q2 | filing `verified`; payment `debit_observed` → `reference_recorded`; incident `debit_not_recognised`; two support contacts logged |
| F-4 | same | IGS, 2026-Q1 | filing and payment `verified`; certificate `blocked`; incident `certificate_blocked` |

No fixture uses a real NIU, a real transaction reference, or a real DGI document.

## 2. Automated checks (CI, `npm test` + SQL negative tests)

Each is pass/fail; any failure blocks merge.

| ID | Check | Layer |
|---|---|---|
| A-1 | No combination of stage and statuses produces client copy "Filed", "Paid", "Complete" or "Conforme" unless the matching dimension is `verified` | engine (`clientStatus`, `nextBestAction`) |
| A-2 | `recordPayment(..., "verified")` without evidence is refused; a debit alone can never reach `verified` | engine + SQL CHECK |
| A-3 | A client session cannot insert `case_events` of kind `filing_verified`, `payment_verified` or any firm kind, nor with `actor_role ≠ client` | SQL, client key |
| A-4 | A client session cannot set payment or certificate to `verified` by direct PATCH | SQL, client key |
| A-5 | Anonymous key cannot list or read `kima-demo`; a client can read only their own taxpayer path | storage, both keys |
| A-6 | A case cannot be delivered with filing ≠ `verified` | engine + SQL |
| A-7 | `nextBestAction()` returns exactly one action; every action carries a source with status `verified`, or the "not yet confirmed" fallback | engine |
| A-8 | `nextBestAction()` never suggests paying again while payment is `debit_observed`, `reference_recorded` or `disputed` | engine |
| A-9 | The case-file export contains the "not an ACF" line in both locales and no element named or styled as a certificate | engine (export builder) |
| A-10 | `KIMA_DEMO_OTP_REVEAL` has no effect when `VERCEL_ENV=production` | route unit |
| A-11 | Every new string has FR and EN (`en` typed against `typeof fr`) | typecheck |

## 3. Browser verification (each slice)

FR and EN at 375 / 768 / 1024 / 1440, throttled "Slow 3G" for 375. Walk F-2 and F-3
end to end as taxpayer, then as reviewer. Record: time to first meaningful render on slow
3G, whether the next action is visible without scrolling at 375, focus order, contrast.

## 4. Comprehension protocol (needs real people — owner question 4)

From the brief §10. Baseline (DGI instructions + a notes app) vs guided (KIMA prototype),
same participants, counterbalanced order, synthetic scenarios F-2, F-3, F-4.

| Metric | How | Proposed pass criterion (owner to approve) |
|---|---|---|
| 1. Correct next action | Blind scoring against a rubric written from **verified** sources only | No critical wrong instruction; ≥ 90% correct |
| 2. Evidence completeness | Checklist of references / timestamps / screenshots in the resulting record | ≥ 90%; nothing invented |
| 3. Time to correct action | Timed, both arms | Directional improvement; threshold set after pilot |
| 4. False completion | Count of "filed / paid / compliant" conclusions that are untrue | **Zero** |
| 5. Clarity | "What is still unresolved?" asked after the task | ≥ 80% state it correctly |
| 6. Trust and intent | Willingness to reuse / pay — stated, not observed | Qualitative only; no demand claim |

Conditions: bilingual participants in their preferred language; mobile only; at least one
session on a throttled connection. Every failure case and unresolved legal question is
written down, not averaged away.

**Until §4 runs with real IGS taxpayers, no document may claim KIMA reduces time,
errors or cost.**
