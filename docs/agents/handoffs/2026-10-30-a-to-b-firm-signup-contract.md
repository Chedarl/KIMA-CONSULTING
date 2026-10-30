# Phase 2 firm sign-up: gated database contract for bilingual UI

- **From → to:** Agent A → Agent B
- **Status:** open; do not integrate until owner approves gate 5
- **Blocks:** Phase 2 public form and FR/EN/mobile journey; stacked draft #46 on #45

## What changed
After Supabase Auth's email OTP confirms the address, call
`public.sign_up_firm(p_name text, p_registration_number text, p_owner_name text)`
with that authenticated Supabase session. It returns the new firm UUID.
One transaction creates an unverified firm, its `firm_partner` member bound
to `auth.uid()`, and an audit event. The email comes from Auth, not the form.
No caller-supplied org UUID, role, email or verification label is accepted.

The database flag `app_flags.allow_firm_signup` is **OFF by default**.
Do not enable it, expose the form, or point previews at production until
owner approval and isolated two-firm staging tests. Duplicate firm name or
registration number: SQLSTATE 23505, direct user to KIMA support.
Unconfirmed/already-used identity or disabled flag: 42501.
Invalid names/registration hygiene: 22023. No official ONECCA number format
is asserted. On success, use `current_firm_intake_identity()` for the member
and show the firm as **unverified** (number checked by KIMA admin only).

## Why
Owner-approved instant signup with R-57 impersonation safeguards.
The old public application flow cannot safely create a firm or owner.

## Done when
Agent B's mocked bilingual/mobile journey handles every error and the
unverified label; after the owner permits integration, two independently
registered firms can onboard clients and neither can read the other's data.
