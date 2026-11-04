# Screen conformance skill

Use before declaring a KIMA screen done: it must tie to the design spec, the shared
design system, and the backend schema it reads.

## Steps

1. Add the page to the `PAGES` array in `scripts/screen-conformance.cjs` with its
   spec id, route, signature strings (lower-case, accent-insensitive) and the tables
   it must read.
2. Run `SUPABASE_MGMT_TOKEN=... node scripts/screen-conformance.cjs` with the dev
   server up. Fix any `MISSING` entry before opening the PR.
3. For pages that need a record (document, case), create a temporary row and delete
   it — never point the audit at live client data.
4. The audit also checks the theme variable, the single main landmark, the shared
   shell, and that each table exists in production.

## Rules

- The theme must stay the KIMA logo theme (navy/indigo/green); the mockup is a
  structure reference, not a palette.
- A page that renders the not-found/empty state for the audit fixture is not a pass.
- The audit is read-only against production; fixtures are temporary and removed.
