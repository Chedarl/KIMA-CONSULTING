# KIMA Compliance OS

Tax compliance management, accounting workflow automation and digital taxpayer
services. Initial market Cameroon, expansion CEMAC. French and English, XAF.

**Clear Records. Confident Compliance.**
**Vos comptes en ordre. Vos obligations maîtrisées.**

> Interface prototype with demonstration data only. No DGI authorization,
> partnership or e-filing integration is established or claimed.

## What is here

| Path | Contents |
|---|---|
| `docs/blueprint/` | The product baseline — Business Concept Note, PRD and AI Development Blueprint v1.0 |
| `docs/foundation/` | Sitemap, ERD, permissions matrix, risk register, Sage/DSF ingestion research |
| `docs/design/` | Generated design system (superseded — predates the blueprint) |
| `app/`, `components/`, `lib/` | The Next.js design-system and interface prototype |

Read `CLAUDE.md` before changing anything: it carries the hard constraints
(no invented tax rules, no claimed government integration, tax regime is not
the DSF accounting format, evidence-gated filing status, tenant isolation).

## Routes

Every route is locale-prefixed; `/` redirects to `/fr`.

| Route | Surface |
|---|---|
| `/fr`, `/en` | Public overview |
| `/fr/app` | Taxpayer portal — one next action, document checklist, progress |
| `/fr/workspace` | Firm workspace — dense portfolio table, intake queue, review gate |
| `/fr/design` | Design system — tokens, contrast, status honesty, components |

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

Next.js 14 · TypeScript · Tailwind CSS 3 · IBM Plex Sans and Mono.
