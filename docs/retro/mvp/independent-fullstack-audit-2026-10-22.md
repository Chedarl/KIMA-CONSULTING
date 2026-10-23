# KIMA Compliance OS — Independent Full-Stack Product Audit

**Date:** 2026-10-22  
**Orchestrator:** lead QA (this session)  
**Primary auditor:** [kima-qa-auditor](9544d97e-01e9-408c-8049-225af25b6a90) (read-only)  
**ECC specialists:** security-reviewer · database-reviewer · architect — **unavailable** (model usage limits); orchestrator spot-verified auditor claims against the tree  
**Sources of truth:** blueprint v1.0 (§7, §9, §10, §18, §20) · `CLAUDE.md` · `docs/foundation/*` · `docs/retro/mvp/{baseline-audit,gap-register}.md` · README · live code  
**PRD:** `docs/PRODUCT_REQUIREMENTS.md` — **UNDEFINED** (absent); blueprint used as proxy  
**Environment:** no `.env.local` → live Auth / OTP / RLS E2E **NOT TESTED**

---

## 1. Executive assessment

The product has a **strong pure-engine spine** (`lib/rules`, `cases`, `events`, `permissions`, `document-review`, `commands`, `db-write`) and serious SQL integrity work (filing evidence CHECKs, append-only `case_events`, capability-scoped writes, OTP auth close-out migrations). That is ahead of a typical UI prototype.

It is **not** an Operational MVP under blueprint Milestone 2 / §18. Live firm/portal mutation depends on Auth + service-role that this audit could not exercise. Several high-value screens still mutate tables **around** the command layer; document acceptance is still **binary** while three-verdict UI is a disconnected lab; **`compliance_cases` and `declarations` remain parallel models**.

**Release / pilot with real data:** not ready. R-32 / R-36 remain blockers until demo-anon is off and OTP Auth is proven end-to-end.

### Final recommendation: **PAUSE FOR CORRECTIONS**

- Not **PROCEED** — Operational MVP unmet; live auth unproven.  
- Not full **ARCHITECTURAL REVISION** — engines and CHECK direction are sound; finish wiring.

---

## 2. Requirements → implementation (summary)

| Requirement | Verdict | Notes |
|---|---|---|
| Kima Client portal (P0) | PARTIAL | Dashboards live; compliance/declarations/archive rebuilt but nav `ready: false` |
| Secure login / R-36 | PARTIAL | OTP in tree; `portal_sign_in` revoked in SQL; live session NOT TESTED |
| Registration / onboarding | PARTIAL | `/register` + organizer; F6 triage missing |
| Firm multi-client workspace | PARTIAL | Clients + queue + **case-detail**; no Client 360 |
| Document upload + archive | PARTIAL | Storage path exists; vault nav disabled |
| Messaging | PARTIAL | Realtime components; E2E NOT TESTED |
| Compliance calendar | PARTIAL | Due dates on cases; calendar nav disabled |
| Declaration workflow + review + evidence | PARTIAL | Case spine uses engines; Reviews uses `declarations` without `canApproveReview` |
| Three verdicts (live path) | **FAIL** | Binary accept/return on intake/inbox |
| Unverified rules inactive | **PASS** | Engine + harness |
| No claimed DGI integration | **PASS** | Copy inspection |
| Tenant isolation | **NOT TESTED** | Needs Auth sessions |
| DSF Bridge / Clarity AI | **MISSING** | Research only |
| Blueprint A/B/D/G/H/J | **MISSING** | Per CLAUDE.md |

Full matrix: see auditor transcript (linked above).

---

## 3. Inventory

### Completed (code-level)
Rule-pack + verification gate · Case/events/permissions engines · Three-verdict **library** · Registration + public register · Auth-closeout migrations (OTP, revoke NIU login, capability writes) · `lib/commands.ts` + `lib/db-write.ts` · CI (`.github/workflows/ci.yml`) · Case detail using `advance` / `canApproveReview` / `updateById` · Client send via `updateById` · Client record pages live (ex-demo-data)

### Partial
Firm/client dashboards, inbox, messaging, filing framework, reviews panel · OTP UIs without proven env · Document upload · Client nav honesty · `activity_events` residue · Migration export (~13/29) · Thin engine harness vs README F2–F4 claims

### Missing
Client 360 · firm calendar/vault/billing/reports/admin · DSF Bridge · Clarity AI · F5/F6/F7 · MFA for privileged roles · full public sitemap · PRODUCT_REQUIREMENTS.md

### Unverified
Live RLS · OTP E2E · multi-tenant isolation · realtime dual-screen loop · a11y at four widths · remote-only migrations · Resend/Storage policies

---

## 4. Prior gap register (G-01–G-18) — re-verified

| ID | Status this audit |
|---|---|
| G-01 Mutations bypass engines | **Partially fixed** — case-detail uses engines; `commandAdvanceCase` still **zero UI callers** |
| G-02 Permissions unused | **Partially fixed** — case-detail yes; reviews/intake/inbox no |
| G-03 No firm Auth | **Partially fixed** — OTP UI + migrations; demo-anon remains |
| G-04 NIU `portal_sign_in` | **Fixed in tree**; live NOT TESTED |
| G-05 Dual case/declaration | **Open** |
| G-06 Binary intake vs verdict lab | **Open** |
| G-07 Inferred obligations | **Fixed (engine)** |
| G-08 No tests | **Partial** — `npm test` + thin harness |
| G-09 No CI | **Fixed** |
| G-10 Open `/api/inquiry` | **Fixed in tree**; live NOT TESTED |
| G-11 Dual activity_events | **Partial** |
| G-12 Client demo-data pages | **Pages fixed; nav still ready:false + stale comment** |
| G-13–G-18 | Doc drift / migrations / §20 / SoD adapter / F5–F7 — largely **open** |

### Spot-check (orchestrator)

| Claim | Result |
|---|---|
| `commandAdvanceCase` unused by UI | **Confirmed** — only `scripts/engine-check.mjs` |
| `case-detail` uses `canApproveReview` + `updateById` | **Confirmed** |
| `reviews-panel` mutates `declarations` | **Confirmed** |
| Client nav `ready: false` for live record pages | **Confirmed** `app/[locale]/app/layout.tsx` L24–28 |
| CI workflow present | **Confirmed** `.github/workflows/ci.yml` |

---

## 5. Defect register (severity-ranked)

| Sev | ID | Issue | Evidence | Business impact | Recommended fix | Acceptance test |
|---|---|---|---|---|---|---|
| P0 | D-01 | Demo-anon still available | `app_flags` / README | Blocks real data (R-32) | Flag false before real data | Anon SELECT taxpayers = 0 |
| P0 | D-02 | Auth unproven without secrets | No `.env.local` | No real sessions | Provision env; prove OTP | Firm + portal session → write |
| P1 | D-03 | Commands unused by UI | `lib/commands.ts` | SoD only in harness | Wire case-detail through commands | `kima_admin` advance refused in UI |
| P1 | D-04 | Dual declarations / cases | reviews vs case-detail | Two filing truths | One aggregate | Filing updates one model |
| P1 | D-05 | Binary intake vs 3 verdicts | intake / inbox | Hard constraint fail | Persist verdicts; drive UI | Fail accounting + pass VAT both stored |
| P1 | D-06 | Reviews skips `canApproveReview` | reviews-panel | Scenario E hole | Call permissions + updateById | Preparer cannot self-approve |
| P1 | D-07 | Raw `.update()` still common | intake/inbox/reviews/docs | Silent refusal lies | All via `updateById` | Anon PATCH shows failure |
| P1 | D-08 | Acting-as without session | case-detail | Capability theatre | Require firm login | Mutations denied without session |
| P2 | D-09 | Live pages nav-disabled | app layout | Users can't reach work | Flip `ready` / fix comment | Nav opens live records |
| P2 | D-10 | Coverage matrix stale | frontend-backend-coverage.md | Wrong steering | Refresh with routes | Matrix matches tree |
| P2 | D-11 | README assertion overclaim | README vs engine-check | False confidence | Expand tests or rewrite counts | CI matches claimed count |
| P2 | D-12 | Migrations incomplete in repo | migrations README | PRs can't review RLS | Export remainder | Clone reconstructs policies |
| P2 | D-13 | Role taxonomy drift | matrix vs FirmRole | Authz ambiguity | Single enum | Matrix = code |
| P2 | D-14 | RLS helpers as RPC | README known | Probe surface | Non-exposed schema | Helpers not in RPC list |
| P3 | D-15–16 | Design MASTER / demo-data types | CLAUDE / ui.tsx | Polish / residue | Design regen; move types | No product import of demo-data |

---

## 6. Architectural problems before more features

1. Command + persistence seam incomplete  
2. Dual work aggregate (`declarations` vs `compliance_cases`)  
3. Document truth model (binary vs three verdicts)  
4. Auth as product boundary (no fake “Acting as”)  
5. Schema-as-code gap (remote-only migrations)  
6. Documentation false-green (README / coverage / layout)

Do **not** start CEMAC packs, Clarity AI, or DSF Bridge until 1–4 are closed.

---

## 7. Suggested implementation sequence

1. Operable Auth proof + `allow_demo_anon` false before real data  
2. Wire all case stage/filing mutations through `commands` + `updateById`  
3. Unify or freeze declarations ↔ cases  
4. Three-verdict intake (persist + UI)  
5. `updateById` on remaining writers  
6. Export migrations + move RLS helpers  
7. Honesty pass (nav, README, coverage)  
8. Expand `npm test`; then F6 / calendar / Client 360 / Storage hardening / F5  

---

## 8. Regression test plan

| Layer | Lock |
|---|---|
| Engines | Extend `engine-check.mjs`: isActive, proposeCases, commandAdvanceCase SoD, three verdicts |
| SQL / RLS | Anon cannot UPDATE; capability-less cannot advance; filed without evidence rejected |
| Auth | OTP wrong/expired/lockout; `portal_sign_in` execute fails |
| UI | Case move reasons match engine; client send → `submitted` not `accepted` |
| Isolation | Firm A cannot read Firm B taxpayer by UUID |
| i18n / CI | typecheck en↔fr; existing CI + optional “commands must have UI importer” |

---

## 9. Explicitly NOT tested

No `.env.local` · OTP email delivery · Auth session mint · multi-tenant isolation · browser E2E / a11y · 16 remote migrations · Resend / Storage policies beyond inspection · remote `allow_demo_anon` current value (README claims on for synthetic — **hypothesis**)

---

## 10. Hypotheses vs verified

| Verified | Hypothesis only |
|---|---|
| `commandAdvanceCase` has zero UI callers | Remote demo flag currently true |
| Binary intake vs verdict lab | Live OTP works when secrets present |
| Reviews vs cases dual model | Full remote RLS matches exported subset |
| G-04/G-07/G-09/G-10 code-level fixes | Silent-update bugs currently hit demo users |
| CI + thin harness; no `.env.local` | |

---

**Bottom line:** High-quality engine + partial operational UI under synthetic-data constraints — not a completed Priority 0 commercial release. Pause feature expansion; close auth proof, command wiring, dual-model collapse, and three-verdict intake first.

*No application code, database data, or production configuration was modified during this audit.*
