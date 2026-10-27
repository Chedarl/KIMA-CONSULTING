# Taxpayer-first discovery — 27 October 2026

Response to the owner's handoff brief *KIMA Compliance OS — Taxpayer-first strategy,
evidence review, end-to-end journeys and coding-agent decision brief* (27 Oct 2026).
The brief is not in the repo; this folder is its working answer.

**Status: proposal (Gate 3).** Nothing here authorises a build. Step 2 of the plan — a
P0 safety patch, then one incident-recovery slice — waits for the owner's explicit
approval of these documents. The one code change made so far is the owner-ordered
hiding of the accounting-firm sign-up option (answer 5 below).

Audited against `main` @ `62405fa`. Every claim about the code cites a file and line;
every claim about Cameroon tax practice carries a status (`verified` / `inferred` /
`unverified` / `unknown`) on the scale in `docs/foundation/cameroon-rule-corpus-research.md`.

| File | Brief deliverable | What it settles |
|---|---|---|
| [`thesis.md`](thesis.md) | A | What KIMA is, what it will not do, and how the brief fits inside the blueprint |
| [`gap-matrix.md`](gap-matrix.md) | B | Current vs target, tied to functions, tables and routes; the P0 defects |
| [`journeys.md`](journeys.md) | C | Three failure journeys as state diagrams and swimlanes |
| [`backlog.md`](backlog.md) | D | Ranked backlog — KEEP / ADAPT / BUILD / DEFER |
| [`security-and-sources.md`](security-and-sources.md) | E | Threat model, source-verification plan, new risks, owner questions |
| [`test-protocol.md`](test-protocol.md) | F | Synthetic fixtures, pass/fail rubric, what still needs real users |

## Owner decisions already taken (27 Oct 2026)

1. **The blueprint stands.** It is not amended to make the accountant optional. The
   brief's taxpayer-first idea is applied *inside* it — see `thesis.md` §3.
2. **First build slice:** the P0 honesty/safety patch, then incident recovery for
   "funds debited, payment not recognised".
3. **The unfinished Edge-Function sign-in work** found uncommitted in a second local
   checkout is finished as part of P0, not discarded.
4. **These deliverables live here**, merged through a pull request.

## Owner answers to the open questions (27 Oct 2026, second round)

| # | Question (`security-and-sources.md` §4) | Answer | Consequence |
|---|---|---|---|
| 1 | Who reviews for a taxpayer with no firm? | **A certified accountant — an expert-comptable** | The reviewer is a credentialed person, not a role name. `firm_reviewer` must carry a recorded professional registration before it can verify anything (backlog P1-8). A taxpayer with no firm is reviewed by an expert-comptable engaged through Kima |
| 2 | Is incident recovery paid? | **Part of the engagement** | A taxpayer may *record* an incident alone (declared, free). Recovery — reviewer work, escalation, verification — runs under an engagement; `authorityCheck` → `no_engagement` already models the gate |
| 3 | Who obtains the primary texts? | **The system must help** — fetch the current official text, simplify it, and show it to taxpayers in their workspace as news | New item P1-9 (official-text register + plain-language bulletins). An expert-comptable publishes every bulletin; a machine draft is never shown. See `backlog.md` and R-45/R-46 |
| 4 | Real IGS taxpayers for the comprehension test? | **Yes, 5–10 can be reached** | `test-protocol.md` §4 can run. Participants work on synthetic scenarios, never their own records (R-32 / R-36 still hold) |
| 5 | Hide the accounting-firm sign-up until organisation scoping? | **Yes** | Done: `OPEN_WORKSPACE_KINDS` in `lib/public-onboarding.ts`; the option is gone from onboarding, the contact form and the pricing cards. `?type=accounting_firm` no longer preselects it. Reopen after P2-5 |

## The approval question

The brief's standard: *explain why each feature solves a documented taxpayer problem,
which parts KIMA controls versus the DGI, what evidence changes each status, and how
correctness is tested.* Those four answers are, respectively, `thesis.md` §2,
`journeys.md` §1, `journeys.md` §2 and `test-protocol.md`.
