# Baseline audit — MVP slice (ECC Phase 1)

**Date:** 2026-10-22 (America/New_York)  
**Stack:** Next.js 14 App Router · TypeScript · Tailwind 3 · Supabase JS  
**Fingerprint:** no test runner, no CI, 12/28 migrations in-repo, ECC Cursor minimal profile installed locally (`.cursor/` gitignored)

## Recon

| Signal | Result |
|---|---|
| Package scripts | `dev`, `build`, `start`, `typecheck`, `lint` |
| Tests in tree | None (`*-check.js` claimed by README absent) |
| CI | No `.github/workflows` |
| Live engines | `lib/{rules,cases,events,permissions,document-review,document-naming,registration,crm,diagnostics,organizer}.ts` |
| Demo residue | `lib/demo-data.ts` → client compliance / declarations / archive |
| Migrations on disk | 12 SQL files + README listing 28 applied remotely |

## Reviewer summary

| Lens | Top finding |
|---|---|
| Security | Anon demo branch + capability-blind writes + NIU login still wired |
| Architecture | Strong pure engines; UI writes around them; dual case/declaration models |
| Coding practice | Permissions unused; activity_events dual log; no automated proof |
| Product / docs | README excellent as handover but self-contradicts on R-36 and assertion counts |

## TODO / HACK inventory

No `TODO`/`FIXME` markers in product `*.ts`/`*.tsx` at audit time. Open work lives in README “Known open items” and “Next” instead.
