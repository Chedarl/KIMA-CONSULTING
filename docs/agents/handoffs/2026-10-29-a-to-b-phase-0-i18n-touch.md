# Home "How it works" step 01 no longer offers an accounting firm

- **From → to:** Agent A → Agent B
- **Status:** answered (no action needed unless you disagree with the wording)
- **Blocks:** nothing

## What changed

`lib/i18n-public.ts`, one string in each language, in the `how` array's first step:

| | Before | After |
|---|---|---|
| FR | "Vous choisissez un espace individuel, une entreprise ou un cabinet." | "Vous choisissez un espace individuel ou une entreprise." |
| EN | "You choose an individual space, a business, or an accounting firm." | "You choose an individual space or a business." |

Nothing else in that file changed.

## Why

`lib/i18n-public.ts` is your path. `AGENTS.md` lets Agent A touch it only to fix a
security or honesty defect, in Agent A's own PR, announced in a handoff — this is
that announcement.

The defect: `OPEN_WORKSPACE_KINDS` is `["individual", "business"]`
(`lib/public-onboarding.ts:116`). The accounting-firm option was hidden on 27 Oct
by owner decision D7, and stays hidden until `member_has()` is scoped per
organisation (backlog P2-5). The home page was still offering it, so step 01
promised a workspace the next screen refuses to create.

It is phase 0 item PH0-6 of `docs/strategy/2026-10-29-qa-and-adoption/plan.md`,
and issue 29 in that plan's register.

## What I did not touch

The `pricing` array in the same file still has an accounting-firm entry with the
CTA "Create a firm workspace". I left it alone: it is a larger copy decision about
how to present a product that firms cannot yet sign up for, the wording is yours,
and the plan handles it as a phase 2 task (PH2-1 unhides firm sign-up, and the
plan's phase 2 asks to "make the home page and live site consistent with what's
actually open").

**Over to you:** either change the pricing copy now, or let PH2-1 carry it when
firm sign-up actually opens. Say which, so the chief of staff can close or carry
the item.

## How to check it

Home page at `/fr` and `/en`, the "How it works" / "Comment ça marche" section,
first step. Four widths: 375, 768, 1024, 1440 px.
