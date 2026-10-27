# Taxpayer-first discovery — 27 October 2026

Response to the owner's handoff brief *KIMA Compliance OS — Taxpayer-first strategy,
evidence review, end-to-end journeys and coding-agent decision brief* (27 Oct 2026).
The brief is not in the repo; this folder is its working answer.

**Status: proposal (Gate 3). No code, schema or configuration has changed.** Nothing here
authorises a build. Step 2 of the plan — a P0 safety patch, then one incident-recovery
slice — waits for the owner's explicit approval of these documents.

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

## The approval question

The brief's standard: *explain why each feature solves a documented taxpayer problem,
which parts KIMA controls versus the DGI, what evidence changes each status, and how
correctness is tested.* Those four answers are, respectively, `thesis.md` §2,
`journeys.md` §1, `journeys.md` §2 and `test-protocol.md`.
