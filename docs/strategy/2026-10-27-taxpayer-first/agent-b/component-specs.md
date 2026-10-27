# Component specs — incident recovery (Agent B)

All components live in `components/prototype/` and use the existing Tailwind tokens
(`navy`, `teal`, `amber`, `danger`, `surface`, `border`, `fg*`) and the card shape of
`components/ui.tsx`. Copy comes only from `lib/i18n-incident.ts` (`en: typeof fr`).
Logic comes only from `lib/incidents.ts` and `lib/next-best-action.ts`; components hold
no rule of their own.

Shared rules: touch targets ≥ 44 px; visible focus ring (global `:focus-visible`);
meaning never in colour alone (every basis has a glyph and a word); dates rendered as
`YYYY-MM-DD HH:mm` in Africa/Douala (computed — UTC+01:00, no DST — so server and
client agree); no network call.

| Component | File | Props | Behaviour | States / a11y |
|---|---|---|---|---|
| **Page** | `app/[locale]/prototype/incident/page.tsx` | `params.locale` | Server component. 404 on unknown locale. `robots: noindex, nofollow, nocache`. Renders banner, heading, `IncidentPrototype`, footer with the "not an ACF" line | Own `<main id="main">` (the skip link targets it); not referenced by any nav |
| **IncidentPrototype** | `incident-prototype.tsx` | `locale`, `t` | Holds local state: fixture id, view, incident copy, last message. Recomputes the next action on every render. "Reset" reloads the fixture | Scenario `<select>` labelled; view switch is a radio group of two labels (sr-only inputs); messages in `role=status aria-live=polite` |
| **NextActionCard** | `next-action-card.tsx` | `action`, `locale`, `t` | Exactly one action: title, why, optional "do not pay again" warning, source line. Fallback source in amber bold; verified source shows its doc reference in mono | Heading via `aria-labelledby`; warning prefixed with sr-only "Attention" |
| **StatusDimensions** | `status-dimensions.tsx` | stage, filing, payment, billing, certificate, `view` | Five `<dt>/<dd>` cells, never merged. Each cell: value + `BasisChip`. Payment / certificate values in amber when unresolved / blocked. Basis word changes by view ("Vous avez déclaré" vs "Déclaré par le contribuable") | `<dl>` grid: 1 col at 375, 2 at `sm`, 5 at `xl` |
| **BasisChip** | `parts.tsx` | `basis`, children | declared = dashed amber + pencil; verified = teal + check; recorded = grey + circle | Text always present |
| **IncidentSummary** | `incident-record.tsx` | `incident`, `t` | Status, observed-at, step, reported message, **masked reference** with "last 4 only" note, evidence list split official / own record | Empty state when no incident |
| **EscalationLog** | `incident-record.tsx` | `incident`, `t` | Ordered list of contacts: channel, time, with whom, masked file no., answer, "still open" (amber) | Empty state |
| **Unresolved** | `incident-record.tsx` | `incident`, `t` | From `unresolvedItems()`: payment not verified, incident not closed — or "nothing" | Answers metric 5 |
| **History** | `incident-record.tsx` | `incident`, `t` | Events newest first, each with its basis chip, actor role and label | — |
| **TaxpayerForm** | `record-forms.tsx` | `incident`, `t`, `onResult` | "Record what happened": debit / reference / evidence / contact / follow-up (only if offered). Calls the engine as the taxpayer; creates an incident on F-1. Clears the reference field the moment it is masked. Warns against typing passwords or codes | No verify control exists in this component; native `required` / `minLength` |
| **ReviewerPanel** | `record-forms.tsx` | `incident`, `t`, `onResult` | Cite-evidence select, reason, and only the buttons the engine offers (`offeredPaymentTargets` / `offeredIncidentTargets` for a reviewer). Refusals are shown, not hidden | Rendered only when view = reviewer |

## Copy rules

- Taxpayer acts are worded "Vous avez déclaré / You reported".
- A debit is "Débit constaté — non payé / Debit seen — not paid"; a reference is
  "Référence notée — non vérifié / Reference noted — not verified".
- "Paiement vérifié / Payment verified" appears only after a reviewer act.
- Anything that depends on the administration carries
  "Pas encore confirmé — renseignez-vous auprès de votre centre des impôts /
  Not yet confirmed — ask your tax centre".
- No number appears in guidance (enforced by A-7b in `journey-check.mjs`).

## For integration (gate 5)

Replace the fixture source with a loader for the case, its incident, evidence and
contacts; replace the `onResult` local update with writes through `lib/db-write.ts`
(Agent A's), keeping the engine call **before** the write so the UI refuses what the
database would refuse. Uploads go through the storage policy of P0-1.
