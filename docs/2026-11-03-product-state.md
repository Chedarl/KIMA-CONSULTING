# KIMA OS — Product state, 3 November 2026

Dated, evidence-based snapshot. The README's historical sections describe the
journey; this document describes the product as it is, and it is the file to
update when the facts change.

## Current release status

**HOLD — not released for general customer use.**

- Production migrations 104, staging 104 (parity restored 3 Nov).
- `allow_firm_signup` and `allow_public_contact_inquiries` are **enabled** on
  both environments, set by the owner on 3 November 2026 (recorded in the flag
  notes). Firm account creation still waits on email delivery.
- No DGI/government integration exists or is claimed.
- The public marketing site remains demonstration content; the workspace is
  operational for signed-in firm members.

## Feature coverage matrix

Legend: ✓ verified in the browser as a signed-in firm or admin; ○ code and
database complete but no populated end-to-end journey; — foundation only.

| Module | Code | Verified | Notes |
|---|---|---|---|
| Firm + taxpayer registration | ✓ | ✓ | Application path proven anonymous end-to-end |
| Authentication (OTP, magic link, password) | ✓ | ✓ | Password login #280; magic-link adoption fix #276 |
| Dual-seat memberships | ✓ | ✓ | SoD contract pinned by six pgTAP tests (#288) |
| Firm dashboard | ✓ | ✓ | 21 routes sweep clean |
| Client dashboard | ✓ | ○ | Requests + RLS verified; upload UI loop open |
| CRM / clients / engagements | ✓ | ✓ | Client records, search, staff page |
| Case management | ✓ | ✓ | Status engine + evidence gates in tests |
| Task board | ✓ | ✓ | Create verified on production |
| Document vault | ✓ | ○ | Backend + compensation (#273); full lifecycle open |
| Inbox / verdicts | ✓ | ○ | Verdict flow tested on staging |
| Messaging | ○ | — | Thread schema merged; no UI journey yet |
| Billing | ○ | — | Records exist; invoice issuance open |
| Payment incidents | ✓ | ✓ | Create + evidence + escalation + verify |
| KYC portal | ✓ | ✓ | Admin verify action proven (#279) |
| DSF / SYSCOHADA | ✓ | ✓ | Dry run + mapping + defect reporting; workbook open |
| Clarity engine | ✓ | ○ | Assertion harness green; UI open |
| Calendar / rules | ✓ | ○ | Rule engine + deadline calendar |
| Time tracking / attestations / reminders | ○ | — | Schema + dispatch; UI open |
| Kima assistant | ✓ | ✓ | Guide, checklist, verified search (#286, #287) |

## Architecture

Next.js 14 App Router, React 18, TypeScript strict, Tailwind. Supabase with
PostgREST + RLS; every sensitive operation is a SECURITY DEFINER function in
the `private` schema; storage in the `kima-demo` bucket. Tenant isolation is
correctness: a client or firm never sees another tenant's rows by policy.

## Deployment environments

| Environment | Ref | Migrations | Role |
|---|---|---|---|
| Production | vhrnrbnjhmxrygvyfirf | 104 | The deployed site |
| Staging | usrnjhuwmhxelkpqgyox | 104 | Isolated verification with two synthetic tenants |

## Security boundaries

- Demo sign-in endpoint: environment gate + same-origin + production-ref
  refusal + an approved-tester key (min 16 chars) held only in the deployment
  environment (#283). The auto-mint button was removed.
- Public contact intake: visitors may write exactly the six message columns;
  `id` and `received_at` are not writable (pgTAP T-232…T-234).
- Definable definer surface: 1 anonymous-executable and 8 authenticated-
  executable functions in public, each with an individual disposition.
- One login may hold a professional seat and an admin seat; professional
  helpers resolve the professional seat and admin gates check all seats; the
  contract is pinned by tests.
- Demo credentials were published in a PR description once; they have been
  rotated and the description redacted.

## Known defects and open items

- Firm account creation cannot deliver one-time codes: no mail provider key is
  configured (Resend). Blocking item for self-signup.
- Document upload → review → versioned download → archive has no populated
  end-to-end acceptance evidence on production.
- The production tenant is the vendor organisation; a second firm exists only
  as a synthetic record for the KYC demo.
- 33 FK indexes added (#275); the advisor count is 0 on production.
- README remains a mixed history/product document (this file is step one).

## Testing evidence

- pgTAP suites run on every clean migration replay: registration, firm signup
  atomicity, contact intake, definer surface census, multi-seat SoD, and more.
- Browser verification (Playwright) against production as the owner identity:
  21 workspace routes; task, incident, settings writes; DSF dry run; KYC
  verify as the admin seat; password login; the Kima assistant.
- Phase 7 (two-firm negative tests, NIU concurrency, bilingual journeys,
  real-user pilot) is not complete.

## Roadmap

1. Mail delivery for OTP → complete firm self-signup.
2. Populated document journey across two firms.
3. Operational screens: billing issuance, time tracking, attestations,
   reminders, senior-accountant review.
4. README restructure into product document + dated changelog.
5. Phase 7 release acceptance.
