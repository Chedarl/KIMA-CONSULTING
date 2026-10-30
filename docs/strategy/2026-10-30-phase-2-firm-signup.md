# Phase 2: how a firm gets onto KIMA OS

- **Author:** Agent A (security and data integrity)
- **Status:** proposal. One decision needed from the owner before anything is built.
- **Date:** 30 October 2026
- **Phase 2 item:** *"Firm sign-up flow: create the organisation and the owner membership.
  Unhide it through `OPEN_WORKSPACE_KINDS` only after phase 1 is done."*

## What already exists, which changes the shape of this

I went looking for what to build and found most of the machinery already there, so this
is less a new feature than a decision about which of two existing paths it runs down.

- `registrations` already carries `workspace_kind`, `applicant_name`, `applicant_email`,
  `status`, `decided_by`, `decision_note` and `activated_at`. It is the public
  application table, and the firm intake queue already reads and claims rows in it.
- `lib/public-onboarding.ts` defines `WORKSPACE_KINDS` including `accounting_firm`, and
  `OPEN_WORKSPACE_KINDS = ['individual', 'business']`. So **the firm kind exists and is
  deliberately held back**, in one constant, in three components.
- `organizations` is **fail-closed for writes**: RLS is on and there is no INSERT policy,
  so nothing can create a firm through the API today. Verified as `anon`: refused.
- `firm_members` is the same, and `firm_members_auth_user_id_key` is UNIQUE, so one login
  can hold at most one membership. A person cannot accumulate firms.
- `auth_identity_is_single` already refuses a login that is both a firm member and a
  client.
- `workspace_invites` exists with three columns (`id`, `workspace_ref`, `email`) and no
  rows. It is a stub, not a mechanism.

So the hard parts — fail-closed writes, one-membership-per-login, the intake table — are
done. What is missing is the act that creates an organisation, and the decision about who
may perform it.

## The decision: self-service, or approved?

**Option A — self-service.** A visitor picks "accounting firm", receives a one-time code
at their email, and on verifying it the system creates the organisation and makes them
its owner.

The problem is what the email proves. Firm sign-in works because `firm_issue_code()`
looks the address up in `firm_members` — the membership already exists and the code
proves control of a known address. At sign-up there is no membership to look up, so the
code proves only that someone controls *an* inbox. That is enough to create an account;
it is not enough to establish that a tenant should exist, that the person is an
accountant, or that the firm name is theirs to use. It would let anyone mint an
organisation called "Cabinet Atangana & Associés".

**Option B — approved.** A firm applies, which writes a `registrations` row with
`workspace_kind = 'accounting_firm'`. A KIMA admin reviews it and approves, and the
approval is the act that creates the organisation and the owner membership — atomically,
in one function, the same shape as `open_client_file()` (`20261030110000`).

This reuses the intake table, the status columns and the decision trail that already
exist, and it puts a human between an application and a new tenant. It also matches the
blueprint's posture: a professional claim is verified, not asserted. R-48 settled that a
KIMA admin gets no cross-firm *client* access, and a firm application is not client data,
so the admin role fits without reopening that question.

**Recommendation: Option B.** It is less code, reuses what is built, and the thing it
costs — instant sign-up — is not something a compliance product should want. Option A
can be layered on later for a self-service tier if the business wants one; Option B
cannot be retrofitted under Option A once firms exist.

What Option B does **not** settle, and should not pretend to: whether a KIMA admin
should be the approver forever, and what evidence they check. An expert-comptable
registration number is the obvious candidate and it is already a concept in the codebase
(P1-8, the reviewer credential). Worth deciding before the first real firm, not before
the first line of code.

## What Option B needs built

In order, each its own small PR:

1. **`approve_firm_application()`** — a `SECURITY INVOKER` function, like
   `open_client_file()`, that takes a `registrations` id and creates the `organizations`
   row plus the applicant's owner membership, atomically, recording `decided_by`,
   `decided_at` and `activated_at`. Invoker so every policy still applies and T-53's
   one-definer-in-`public` invariant is untouched; it will need a narrow INSERT policy on
   `organizations` and `firm_members`, keyed on the approver holding the right capability,
   rather than the blanket policies their absence currently stands in for.
2. **R-55 first, or with it.** `organizations` is readable by anyone, including `anon`
   (verified). Harmless with one firm; a customer-list leak the moment there are two. It
   has to close before `accounting_firm` is admitted, and the open question there is
   whether a prospective client needs to read a firm's name before engaging it.
3. **The owner membership's role.** `firm_partner` holds every capability including
   `member.manage`, so it is the natural owner. Worth stating in the migration rather
   than inferring from the matrix.
4. **Team settings** (phase 2's second item) — invite, revoke, assign roles, with an
   audit event for every sensitive change. `workspace_invites` is a three-column stub and
   will need the lifecycle phase 3 describes for taxpayer invitations; the two should
   share one mechanism rather than growing two.
5. **`OPEN_WORKSPACE_KINDS` admits `accounting_firm`** — one constant, three components,
   and the last step rather than the first. Nothing should flip it while R-55 is open or
   while opening a client file is untested end to end in a browser.

## What I have not assumed

Pricing and subscription are explicitly out of scope for phase 2 in the plan, and nothing
above touches them. But "a firm signs up" and "a firm pays" are the same moment
commercially, and building the approval path without knowing whether approval is gated on
payment risks building it twice. Flagging rather than deciding.
