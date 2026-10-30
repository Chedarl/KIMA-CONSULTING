# Proposed wording: the multi-tenant model as a controlling requirement

- **Status: DRAFTED AND HELD. Not applied.**
- **Backlog:** PH0-4 (phase 0 of `plan.md`)
- **Decision needed from the owner:** plan section 2, "Still open" — *should the
  multi-tenant architecture document become the controlling requirement in
  `CLAUDE.md` and the product blueprint?*

## Why this file exists instead of an edit

Phase 0 of the plan asks for this wording to be **drafted and held**. The plan's
own instruction is: "Don't edit `CLAUDE.md` or the blueprint on this point until
the owner decides." So the text sits here, unapplied, and `CLAUDE.md` and
`docs/blueprint/kima-compliance-os-blueprint-v1.0.md` are untouched by this
change.

Nothing in the codebase reads this file. Applying it is a separate, owner-approved
pull request.

## What is at stake in the decision

`CLAUDE.md` today carries tenant isolation as a hard constraint, but it does not
say **at what granularity**. That gap is why `member_has(cap)` could be written to
ask only "does the caller's role hold this capability?" and never "in which
organisation?" — the defect recorded as backlog P2-5, risk R-47 and plan issue 1.

Saying it once, normatively, is what stops the next helper being written the same
way. Declining to say it is a legitimate choice, but then the per-organisation
rule lives only in the backlog, where it can be read as a task rather than a law.

## Proposed addition to `CLAUDE.md`

> ### Tenant isolation is per organisation, not per role
>
> A capability answers two questions, never one: *which capability* and *in which
> organisation*. `member_has(cap, org)` and `can_see_taxpayer(taxpayer)` resolve
> the row's `organization_id` and compare it with the caller's membership. A
> helper that takes a capability and no organisation is a defect, not a
> shorthand.
>
> The firm ↔ taxpayer relationship is many-to-many and revocable, and the
> engagement is the only bridge. One firm has many taxpayers; one taxpayer may
> work with several firms, in sequence or at once, and keeps their account when
> they change firm. A taxpayer's workspace is theirs, not the firm's.
>
> Four consequences, each enforced in the database and in storage, not only in
> the UI:
>
> 1. A firm reads a taxpayer's rows only through a **live** engagement. A
>    `revoked_at` engagement grants nothing, in every policy and every helper.
> 2. A taxpayer reads only their own rows, in every organisation they belong to.
> 3. A KIMA admin gets **no** automatic access to client data. Support access is
>    granted, time-boxed and audited, or it does not exist.
> 4. Every grant and every revocation of access is an immutable audit event: who
>    granted it, to what, and when it ended.
>
> No second `organizations` row may hold members until the per-organisation check
> has merged and the two-firm isolation test is green.

## Proposed addition to the blueprint

A new subsection under the architecture section, stating the same rule in product
terms: the firm organisation is the tenant; the engagement is the authorised
access grant with the lifecycle Invited → Accepted → Active → Revoked/Expired;
the taxpayer workspace survives a change of firm; and the two-firm isolation test
is a release gate, not a test case.

## If the owner says yes

1. One pull request applies the `CLAUDE.md` section above and the blueprint
   subsection. Docs only.
2. `AGENTS.md` cites the new section where it already assigns `supabase/**` to
   Agent A, so the rule is visible at the point of work.
3. PH1-1, PH1-2, PH1-7 and P2-5 become implementations of a stated requirement
   rather than items on a list.

## If the owner says no, or defers

The per-organisation rule stays where it is — backlog P2-5 and risk R-47 — and
this file stays held. **Either way the phase 1 work is unchanged:** scoping
`member_has()` and proving isolation with two firms is a launch blocker on its own
merits. This decision only settles whether the rule is written down as law.
