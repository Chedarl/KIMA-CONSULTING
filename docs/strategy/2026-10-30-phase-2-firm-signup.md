# Phase 2: how a firm gets onto KIMA OS

- **Author:** Agent A (security and data integrity)
- **Status:** **decided by the owner, 30 October 2026.** Sign-up is instant.
- **Supersedes:** the first version of this file, merged in #34, which recommended
  admin approval. The owner decided against it. Anyone building from that version is
  building the wrong thing — the recommendation is recorded below only so the reasoning
  is not lost.

## The decision

**Instant sign-up.** A person confirms their email and is immediately the owner of a new
firm, which can work straight away. No approval step, because nothing should slow a firm
down at the moment it arrives.

I had recommended approval. The argument was that at sign-up there is no membership to
look up, so a confirmed email proves only that someone controls *an* inbox — not that a
tenant should exist, that the person is an accountant, or that the firm name is theirs.
The owner accepted the risk and chose to manage it with safeguards rather than a gate,
and named the risk precisely:

> Without approval, a confirmed email lets anyone create a firm under any name, including
> a real firm's name, and clients will see that name when they choose a firm.

That is the risk the safeguards below exist to contain, and it is carried as **R-57**.

## The safeguards, as instructed

1. **The registration number is unique and format-checked.** A second firm cannot use a
   number another firm already holds.
2. **Every firm starts unverified**, and that label is shown to clients choosing a firm.
   A KIMA admin verifies the number afterwards. The firm works immediately either way.
3. **Suspension, rate limit and audit.** A KIMA admin can suspend a fake firm after the
   fact; sign-ups are limited per address; every sign-up is recorded in the audit log.

## What changes, mapped to the owner's instructions

The owner's note numbers steps 2, 3, 4 and 7. That numbering is not this file's — this
file had five — so each instruction is mapped to what it changes rather than renumbered,
to avoid a silent mis-mapping.

| Owner's instruction | What it means here |
|---|---|
| Step 2, firm names | Visitors see a firm's **name and its verification label, and nothing else**. **Done, 30 Oct, in `20261030130000`:** the open rule is gone, the record is readable only inside the firm, and `public.firm_directory()` is the one public route to a name. The label is the half that is still missing — it needs the column step 1 below adds. |
| Step 3, sign-up | After confirming their email, the person runs **one database function** that creates the firm and makes them its owner in a single step, and **requires the registration number**. |
| Step 4, application form | The public application form **becomes the firm sign-up form**, still behind `OPEN_WORKSPACE_KINDS` until the end-to-end check passes. |
| Payment | Out of phase 2, unchanged. |

## What is already built, and does not need rebuilding

- `organizations` and `firm_members` are **fail-closed for writes**: RLS is on and there
  is no INSERT policy. That is why sign-up does not exist yet, and it is the right
  default — the new function adds the one narrow path rather than opening the tables.
- `firm_members_auth_user_id_key` is UNIQUE, so one login already cannot accumulate firms.
- `auth_identity_is_single` already refuses a login that is both a firm member and a
  client.
- `registrations` already carries `workspace_kind`, and `accounting_firm` already exists
  in `WORKSPACE_KINDS`, held back by one constant in three components.
- `open_client_file()` (`20261030110000`) is the shape to copy: `SECURITY INVOKER`, so
  every policy still applies, atomic, and no `RETURNING` on a row the caller cannot yet
  select.

## Three things that need an answer before step 3 is built

These are not objections to the decision. They are gaps the decision creates, and each
would otherwise be filled by a guess.

**1. The email confirmation has no code path.** `firm_issue_code()` resolves an address
against an existing `firm_members` row, and `portal_issue_code()` against a
`portal_accounts` row. At sign-up neither exists, so instant sign-up needs a third path
that issues a code to an address with **no record at all**. That is new authentication
surface and the first thing an attacker would push on. Two candidates: Supabase Auth's
own email OTP (`signInWithOtp`), which already has rate limiting and does not need a new
table; or a `pending_firm_signups` table we own. Worth choosing deliberately rather than
discovering.

**2. I cannot invent the registration-number format.** `CLAUDE.md` is explicit: every
rule carries a legal source, jurisdiction and effective date, and unverified rules stay
inactive. I do not have the verified ONECCA numbering, so a regex now would be a
fabricated regulatory rule — the exact thing that file forbids. The proposal:
**uniqueness and non-blank now**, which need no source and deliver the safeguard that
actually stops impersonation-by-duplication, and the **format check added once sourced**,
carried as a rule rather than hard-coded, so an unverified format stays inactive instead
of guessed. Rejecting a legitimate firm's real number because we guessed the shape is
worse than accepting an odd-looking one.

**3. "Limit sign-ups per address" needs somewhere to count.** There is no rate-limit
store. `failed_attempts` lives on `portal_accounts` and `firm_members`, per row, which is
no help for an address with no row yet. This is the same decision as (1): Supabase Auth's
OTP brings its own limits, a table of our own does not.

## Two consequences worth stating

**Suspension has to reach the access path, not just a column.** A `suspended_at` on
`organizations` changes nothing on its own: `private.member_has()`,
`member_has_in_org()` and `current_member_org()` all resolve access through
`firm_members`, and none of them would notice. A suspended firm would keep working. The
suspension must be part of those helpers, with a test that a suspended firm's partner
reads nothing — otherwise the safeguard is a label.

**The verification label is a claim shown to taxpayers**, so it falls under the same
honesty rules as every other status in this product. It must not read as verified by the
DGI, and must not imply a professional credential KIMA has not checked — what a KIMA
admin confirms is that a registration number was checked, which is narrower than "this is
a qualified expert-comptable". The wording is Agent B's and needs both locales.

## Build order

1. `organizations` gains `registration_number` (unique, non-blank), `verification_status`
   and `suspended_at`. R-55 is already closed, so this step no longer narrows the read:
   it adds `verification_status` to `public.firm_directory()`'s two columns, which is the
   only change the lookup needs.
2. Suspension wired into the access helpers, with the negative test.
3. The sign-up code path, once (1) above is decided.
4. `sign_up_firm()` — one function, `SECURITY INVOKER`, atomic, requires the number,
   writes the audit entry.
5. The application form becomes the sign-up form, behind the flag.
6. The flag flips last, and only after the end-to-end check passes.
