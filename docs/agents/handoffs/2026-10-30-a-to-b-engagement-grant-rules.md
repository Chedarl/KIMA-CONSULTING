# An engagement now has lifecycle rules the firm screens have to respect

- **From → to:** Agent A → Agent B
- **Status:** open
- **Blocks:** nothing of B's in flight. Affects `components/live/engagements-workspace.tsx`,
  `components/live/onboarding-wizard.tsx` and the client portal's services board.

## What changed

Migration `20261030070000` closes F-01 / risk R-51: a firm could write itself an
authorised engagement against any taxpayer and read that taxpayer's whole file. Four
rules now hold, three of them in `private.engagements_grant_guard()`:

1. An engagement **opens as a draft**. `engagements.status` now defaults to `'draft'`
   and `authorized_at` has no default. An INSERT that names `accepted` or `authorized`,
   or carries either timestamp, is refused with `42501`.
2. **Only the taxpayer writes `accepted_at`**, once. New policy
   `"client accepts engagements"` lets a signed-in taxpayer set `status = 'accepted'` on
   their own engagement, and nothing else.
3. A firm may move an engagement into `accepted` / `authorized` **alone only when no
   other firm currently holds that taxpayer**. With the taxpayer's acceptance recorded it
   may authorise regardless.
4. `organization_id` and `taxpayer_id` are immutable, and a revocation cannot be undone.

## What I changed in your paths, and why

Two things, both because the change would otherwise have made a screen say something
untrue. Flagged here rather than left for you to find.

- **`lib/engagements.ts` — `draftEngagement()` wrote `status: 'pending'`.** That is not
  one of the six states `engagements_status_known` allows, so **every** engagement insert
  through the onboarding wizard and the engagements screen had been refused since
  `20261029213000` merged on 30 Oct 02:42 UTC. It now writes `'draft'`.
  `scripts/engine-check.mjs` asserted `'pending'` too, which is why CI did not catch it.
- **`components/live/engagements-workspace.tsx` — one helper, `writeFailureText()`.**
  Authorise and revoke both showed `labels.failed` for any write error. Rule 3 refuses
  authorisations on grounds the screen cannot see, so a generic "failed" would be the
  wrong answer to a real question. The helper maps the database's own message through
  `engagementWriteRefusal()` / `ENGAGEMENT_WRITE_REFUSAL_LABELS` (both bilingual, in
  `lib/engagements.ts`) and falls back to `labels.failed` for anything unrecognised.

I have not touched layout, copy outside those four strings, or the client portal.

## What is yours

- **A way for a taxpayer to accept.** The policy exists; no screen uses it. Until one
  does, rule 3 is what lets a firm start work, and a second firm cannot be brought in at
  all. The natural home is the client portal's services board, next to the drafts the
  firm has raised. Phase 3 owns the invitation lifecycle around it, so this can be as
  small as an accept action on a draft the taxpayer can already see.
- **The four refusal strings, if the wording is wrong.** They are mine only because the
  rules are; the FR/EN wording is yours to correct. Current text in
  `ENGAGEMENT_WRITE_REFUSAL_LABELS`:
  - `taxpayer_holds_another_firm` — "Un autre cabinet suit déjà ce contribuable. Lui seul
    peut autoriser un second cabinet." / "Another firm already works with this taxpayer.
    Only the taxpayer can bring in a second firm."
  - `acceptance_is_the_taxpayers`, `engagement_cannot_move`, `revocation_is_final`.
- **The engagements screen shows a posture, not a status.** `engagementPosture()` reads
  the timestamps, so a draft reads "Awaiting authorisation" as it always did. Worth
  checking whether an accepted-but-not-yet-authorised engagement should read differently
  from one the taxpayer has not seen — the data now distinguishes them and the screen
  does not.

## Done when

- A taxpayer can accept a draft engagement from the client portal, and the firm's screen
  shows the acceptance.
- The four refusal strings read as you would write them.

## Verification behind this

Migrations replayed from scratch (50) and the whole pgTAP suite run locally against the
replay: 124 assertions, 0 failing. `supabase/tests/engagement_grant_test.sql` run against
the same schema **without** `20261030070000`: 10 of 17 fail, including `T-71 no exception
was raised` (the self-grant) and `T-74 have: 1, want: 0` (Firm A reading Firm B's
taxpayer).
