# C-3 — Phase 3 invitation and portal-activation contract (DRAFT)

**Baseline:** `main`; Phase 2 release follows owner review and exact-head safety gates.
**Scope:** API/type contract only; no SQL, email delivery, activation, or access changes.
The RLS boundary is the caller's identity and an accepted, live engagement—not
possession of a link alone. A draft/invited engagement grants no taxpayer data.

## Records (proposed, not an implemented migration)

- `invitations`: `id uuid`, `direction` (`firm_to_taxpayer` / `taxpayer_to_firm`),
  `organization_id uuid` (receiving firm), `taxpayer_id uuid?` (company),
  `recipient_email text?`,
  `invited_by_auth_user_id uuid`, `token_hash text`, `status`
  (`pending`/`accepted`/`declined`/`revoked`/`expired`),
  `created_at`, `expires_at`, `decided_at`, `decided_by`.
  The database enforces expiry on use; hash and raw token never appear in
  PostgREST results or audit logs. Never permit anonymous table INSERT.
- `engagements`: reuse existing statuses `draft`, `invited`,
  `accepted`, `authorized`, `revoked`, `expired`; do not reauthorize
  a revoked row silently. Do not overwrite irreversible `authorized_at`.
- `portal_accounts`: activate `pending` only after authenticated verified
  contact identity is bound; no guessing identity from a NIU alone.
- `audit_events`: records who sent, accepted, declined, revoked, expired.

## Proposed RPC interfaces (final signature requires D-3/6/8)

| RPC | Inputs | Result on success |
| --- | --- | --- |
| `create_invitation` | direction, firm_id, taxpayer_id?, recipient_email? | invitation_id, expires_at |
| `accept_invitation` | single-use token, authenticated caller | engagement_id, engagement_status |
| `decline_invitation` | single-use token, authenticated caller | invitation_id, declined |
| `revoke_engagement` | engagement_id, actor identity from JWT | revoked_at |
| `activate_portal_account` | invitation token, authenticated verified contact | portal_account_id, active |
| `request_firm_service` | chosen firm_id, service_code, scope_note | draft_engagement_id |

All calls are authenticated; identity is derived from Auth, never trusted
from a request argument. Cross-firm/unknown resources return the same
not-found/forbidden result. RPC privileges are explicit. SECURITY DEFINER
requires locked search_path, least-privilege grants, and negative pgTAP tests.

## Client/server result contracts

Use a discriminated result: `{ok: true, data: T}` or
`{ok: false, code: InvitationError}`. `expired` is not success;
`already_decided` is idempotent only for the same authenticated principal.
Error codes must be bilingual in presentation, not raw database errors.
No private firm attributes or invitation tokens in public directory results.

## Release and tests

1. Two firms × two taxpayers: unrelated identities see no rows or tokens.
2. Token expiry, replay, and wrong-email acceptance rejected by database.
3. Pending portal activation refuses other users, anon, and repeat claim.
4. Revoke prevents next-request reads and writes; audit survives revoke.
5. Service request creates draft engagement and grants zero file access.
6. FR/EN and accessible status text, not colour-only state.

## Owner decisions incorporated

- **D-1:** A former client may return, but only through a **new engagement**
  and a new explicit authorization. A revoked historical row never regains
  access or has its irreversible `authorized_at` rewritten.
- **D-2:** An invitation expires **14 days** after issuance. A resend issues
  a fresh single-use token with a new 14-day expiry and invalidates the old.
  Expiry and token replay are enforced by the database, not the screen.
- **D-7:** One person may own multiple separately registered companies,
  each with its **own taxpayer/company record and NIU**. Different companies
  may appoint different firms; a firm sees only each company that engaged it.
  This is **company-scoped**, not obligation-scoped. It does not authorize
  multiple firms on the same company without a further owner decision.
- **D-4:** A separate Supabase staging project exists; production remains
  a different project. Do not substitute local pgTAP for hosted acceptance.

## Decisions still needed

D-3 SMTP provider/sender domain. D-5 deployment plan/budget.
D-6 historical workpaper access and retention after revocation.
D-8 who may revoke on behalf of a firm.
