# Screen conformance — spec, design system and backend wiring

Date: 4 November 2026. Method: `scripts/screen-conformance.cjs` signs in as the demo
firm (and the demo taxpayer for the portal), visits each page, and asserts:

1. **Spec elements** — the signature strings of that page from the design spec.
2. **Design system** — the KIMA theme variable resolves, exactly one main landmark,
   the shared shell and cards render.
3. **Backend wiring** — each table the page must read exists in the production schema.

Run: `SUPABASE_MGMT_TOKEN=... node scripts/screen-conformance.cjs`.

## Result (all pass)

| ID | Screen | Status | Spec elements | Tables verified |
|---|---|---|---|---|
| F02 | Firm command center | 200 | ok | compliance_cases, invoices, service_payments, document_requests |
| F04 | Client 360° | 200 | ok | taxpayers, engagements, documents, messages, case_events |
| F06 | Workflows board | 200 | ok | compliance_cases |
| F10 | Documents inbox | 200 | ok | documents, document_requests |
| F11 | Document review | 200 | ok | documents, document_verdicts, document_versions |
| F19 | Kima AI | 200 | ok | (verified corpus, no table) |
| F20 | Brand studio | 200 | ok | branding |
| F08 | Templates | 200 | ok | engagement_templates |
| F13 | Compliance case | 200 | ok | compliance_cases, case_events |
| F15 | Billing | 200 | ok | invoices, service_payments |
| C02 | Taxpayer home | 200 | ok | document_requests |

## Notes

- The audit is case-insensitive because headings are CSS-uppercased.
- F11 needs a real document row; the audit creates a temporary one and deletes it.
- Pages not yet audited (F03, F05, F07, F09, F12, F14, F16, F17, F18, A01, A02, P01, P02,
  C01, C03-C08) are extensions of the same check: add an entry to the PAGES array.
