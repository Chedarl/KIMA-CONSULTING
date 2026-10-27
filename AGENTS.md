# AGENTS.md — how the coding agents work on this repository

Read by every coding agent on this repo. **All agents run in Claude Code** (owner, 27 Oct 2026); Cursor is not required. `CLAUDE.md` still holds the product's hard constraints
and wins over this file on product questions. This file decides **who does what, and
when they may act**. Set by the owner on 27 Oct 2026 (two-agent assignment).

## The agents

| Agent | Tool | Definition | Owns |
|---|---|---|---|
| **Agent A — Security and data integrity** | Claude Code | `.claude/agents/kima-agent-a-security.md` | Supabase (migrations, RLS, storage, functions, Edge Functions), authentication, `lib/permissions.ts`, the event-kind allow-lists, status-correctness engines, database and security tests, **technical-readiness conclusions** |
| **Agent B — Taxpayer journey and incident recovery** | Claude Code | `.claude/agents/kima-agent-b-journey.md` | Taxpayer and firm screens, incident-recovery UX, next-best-action content, FR/EN copy, mobile usability, **product-parity and user-journey conclusions** |
| **Chief of staff — coordination** | Claude Code | `.claude/agents/kima-chief-of-staff.md` | Triage of PRs, CI runs, review comments and handoff notes; the coordination board; nothing else. Read-only on code |
| **QA auditor** | Cursor (optional) | `.cursor/agents/kima-qa-auditor.md` | Independent verification; in Claude Code use the `ecc:code-reviewer` / `ecc:security-reviewer` agents |

## Path ownership (one writer per path)

| Path | Writer | The other agent |
|---|---|---|
| `supabase/**` | **A only** | B proposes in a handoff note |
| `app/api/**`, `lib/auth-*.ts`, `lib/portal-auth.ts`, `lib/firm-auth.ts`, `lib/supabase*.ts`, `lib/permissions.ts`, `lib/db-write.ts` | **A only** | B proposes |
| `lib/events.ts` (`EVENT_KINDS`, `CLIENT_EVENT_KINDS`), `lib/cases.ts` status functions (`clientStatus`, `canDeliver`, `recordFiling`, payment states) | **A only** | B proposes |
| `scripts/engine-check.mjs`, `supabase/tests/**`, `.github/workflows/**` | **A only** | B adds UI tests under its own folder |
| `components/**`, `app/[locale]/**` pages, `lib/i18n*.ts` | **B** | A may touch only to fix a security or honesty defect, in its own PR, announced in a handoff |
| New incident engine `lib/incidents.ts`, `lib/next-best-action.ts` | **B** writes the logic; **A** reviews and owns their tests of the rules in `CLAUDE.md` | — |
| `docs/audits/**`, `docs/strategy/**` | Both, each in their own file | — |
| `docs/agents/coordination-board.md` | **Chief of staff only** | Both read it |
| `docs/agents/handoffs/**` | Both (one file per note) | — |

## Stages and gates (the owner approves each gate)

1. **Discovery** — each agent audits its area. No code change.
2. **Planning** — each agent writes its plan as a PR containing only documentation.
3. **Approval** — the owner approves in chat or on the PR. **No agent starts building
   on its own reading of a brief.**
4. **Development** — Agent A implements approved security fixes. Agent B builds the
   prototype against **mock data** shaped by Agent A's contract.
5. **Integration** — Agent B connects to the real backend only after Agent A's relevant
   fixes are merged and their tests pass.
6. **Testing** — A: security and data integrity. B: journey and usability. QA auditor: independent.
7. **Release** — both confirm; the owner decides.

Branches: Agent A `agent-a/*`, Agent B `agent-b/*`, each in its own git worktree.

**Current gate: 3 (Approval).** Audit PR #11 (Agent A) awaits comparison with Agent B's report.

## Hard rules for every agent

- **Never deploy to production, never apply SQL to the production database, never
  merge to `main`** without an owner approval for that specific change.
- Migrations reach production **only** through `.github/workflows/supabase-migrations.yml`
  after merge. Applying SQL by hand creates history drift (it already did:
  `20261023052631` / `052633`).
- Never change a schema or security policy you do not own; write a handoff instead.
- Synthetic data only (`docs/foundation/risk-register.md` R-32, R-36).
- Every PR: one coherent change, its own branch, CI green, README updated when behaviour changes.

## Handoffs

When an agent needs something from the other, or finishes something the other depends
on, it adds `docs/agents/handoffs/YYYY-MM-DD-<from>-to-<to>-<slug>.md` using the template
in `docs/agents/handoffs/README.md`, and links it from the PR. The chief of staff picks
it up on the next triage.
