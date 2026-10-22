# ECC brownfield gap register — MVP slice

**Perimeter:** whole shipped MVP — `lib/`, `app/`, `components/live/`, `supabase/`, `README.md`, `CLAUDE.md`, foundation docs.  
**Method:** ECC `brownfield-retrospective` + `security-review` + architecture pass (2026-10-22).  
**Current phase:** 3 (gap analysis complete; no fixes applied in this pass).

> Synthetic-data demo only. Findings that block real taxpayer data are marked **R-32 / R-36**.

## Constraint scorecard (user-hit paths)

| Constraint | Engine | Live path |
|---|---|---|
| Four axes kept separate | Strong | Mostly |
| Three verdicts per document | Strong | Lab only; intake is binary |
| Unverified rules inactive | Soft (flag only) | Cases still proposed from inferred rules |
| Filing evidence-gated | Strong in SQL + case engine | Reviews path yes; case filing UI thin |
| No invented / claimed DGI integration | Strong | OK |
| Tenant isolation | Documented non-goal in demo | Open via anon demo branch |

## Gap rows (four axes)

| ID | Axis | Severity | Finding | Evidence | Better day-one |
|---|---|---|---|---|---|
| G-01 | Coding practice | Critical | Engines are libraries for display; mutations bypass `advance` / `recordFiling` / `eventsFrom*` | `lib/cases.ts`, `lib/events.ts`; no UI callers; `client-dashboard.tsx` writes status + free event | Single `applyCaseCommand()` writing patch + events in one transaction |
| G-02 | Coding practice | Critical | `lib/permissions.ts` unused at call sites; RLS write policies collapse “can see” into “can mutate” | grep: no component imports `can` / `canApproveReview`; `20261022181457_*.sql` | Capability-scoped write policies + UI checks as secondary |
| G-03 | Missing features | Critical | No firm Auth session; anon demo branch keeps the UI alive | README §auth; `can_see_taxpayer` null-uid → demo taxpayer | Firm login + delete demo branch before real data (R-32) |
| G-04 | Missing features | Critical | Portal still calls deprecated `portal_sign_in` (NIU as secret); OTP unfinished | `lib/portal-auth.ts`, `20261022181734_*.sql` | Wire OTP + Auth session; revoke `portal_sign_in` (R-36) |
| G-05 | Coding practice | High | Dual status models: `compliance_cases` vs `declarations` | Dashboards use cases; `reviews-panel.tsx` mutates declarations | One aggregate before more UI |
| G-06 | Coding practice | High | Live intake is binary accept/return; three-verdict panel is a disconnected lab | `intake-panel.tsx` ~107; `document-verdicts.tsx` | Store three verdicts; intake UI = verdict panel |
| G-07 | Coding practice | High | `obligationsFor` / `proposeCases` emit inferred obligations | `lib/rules.ts` `isActive` vs ~670; `lib/cases.ts` propose | Only verified rules activate obligations |
| G-08 | Missing features | High | No test runner; README harnesses (`*-check.js`) not in repo | `package.json`; 0 `*-check.js`; README ~193–215 | Commit vitest/node harnesses; `npm test` in CI |
| G-09 | Missing features | High | No CI workflows | No `.github/workflows` | typecheck + lint + tests on PR |
| G-10 | Missing features | High | `/api/inquiry` unauthenticated, anon-keyed, no rate limit | `app/api/inquiry/route.ts` | Firm JWT + rate limit + service-role after authz |
| G-11 | Coding practice | High | `activity_events` still live (unstructured dual log) | README known item; 7 writers | Fold into `case_events` |
| G-12 | Coding practice | Medium | Client routes still on `lib/demo-data` while nav says ready | `compliance`, `declarations`, `archive` pages | Finish live migration or mark `ready: false` |
| G-13 | Thinking | Medium | README contradicts itself on R-36 and F4 assertion counts | README ~339 vs ~473; 81 vs 86 | Single source of truth; update Known open items |
| G-14 | Thinking | Medium | 16 of 28 Supabase migrations not in repo | `supabase/migrations/README.md` | Export remainder so PRs can review RLS |
| G-15 | Thinking | Medium | Blueprint deliverables A/B/D/G/H/J still outstanding | `CLAUDE.md` | Prioritize B (backlog + acceptance) and H (API plan) |
| G-16 | Technology | Medium | Diagnostics vs permissions disagree on self-approval | `lib/diagnostics.ts` vs `lib/permissions.ts` | One decision function used by UI + SQL |
| G-17 | Technology | Low | Inter body font vs Cursor frontend rule (not vs blueprint §9) | `app/[locale]/layout.tsx`, README | Brand typeface pass when design system is regenerated |
| G-18 | Missing features | Medium | Registration triage (F6), KPI standard doc (F7), error scenarios (F5) not built | README Next | Keep MVP frame; do not start CEMAC packs until auth closes |

## Priority sequence (fix forward)

1. **Auth close-out** — firm session + portal OTP + delete anon demo branch + capability write policies (G-03, G-04, G-02, G-10).  
2. **Command layer** — all case/document mutations through engines + events (G-01, G-11, G-05, G-06).  
3. **Rule activation gate** — inferred never creates live obligations (G-07).  
4. **Proof** — committed tests + CI; export remaining migrations (G-08, G-09, G-14).  
5. **Surface honesty** — demo pages off or disabled; README consistency (G-12, G-13).

## What is already excellent (keep)

- Honest threat model in comments, risk register, and README — demo vs production is not papered over.  
- Pure engines encode hard constraints carefully (`rules`, `cases`, `events`, `permissions`, `document-review`).  
- SQL CHECKs for filing evidence, delivery gate, append-only `case_events`, self-approval disclosure.  
- `kima_admin` has no professional authority by design.  
- Bilingual `en: typeof fr` dictionaries prevent silent key drift.  
- Seven-step feature gate documented in README (plan → schema → engine → surface → review → commit).
