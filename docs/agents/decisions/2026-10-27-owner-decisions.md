# Owner decisions — 27 October 2026

The owner answered the first coordination board (`docs/agents/coordination-board.md`)
with **"work with the recommendations"**. Each decision below is the recommended option.
Agents treat this file as the written record of approval.

| # | Decision | What it means for the agents |
|---|---|---|
| D1 | **Gate 4 (Development) is declared.** | `AGENTS.md` names the approved PRs. Each development PR is still reviewed and merged only after CI passes. Integration with the real backend (gate 5) needs its own go per PR |
| D2 | **PR #6 is ratified after the fact.** | Agent A reviews the parts of #6 it owns (`supabase/migrations/20261023052631_*`, `20261023052633_*`, `lib/events.ts`, `scripts/engine-check.mjs`) and reports in a handoff. No revert |
| D3 | **The incident migration (backlog P1-2) is approved, on Agent A's reconciled contract.** The payment `verified` CHECK lands **in the same migration** as the P1-8 expert-comptable credential, and only **after** Agent B's reply note on the contract (board item B1). | Agent B writes the reply first; Agent A then builds tables, RLS, the credential and the tests |
| D4 | **A `payment_step_error` incident that later shows a debit switches type to `debit_not_recognised`**, and the switch is recorded as an event. The resolve gate (payment must be `verified`) applies from then on. | Agent B updates `lib/incidents.ts` and the state machine; Agent A reflects it in the schema |
| D5 | **No fixed waiting period before `disputed`.** A reviewer judges. No screen shows a day count until research item S-3 finds the official DGI/Trésor procedure. | Neither agent invents a number of days |
| D6 | **Clients may report fee payments.** Agent A adds a client insert on `service_payments` limited to the reported state (`pending_confirmation`, `reported_by = 'taxpayer'`, own taxpayer, own invoice) and a read-own policy. Agent B hides the button only if Agent A's policy is not merged first. | Agent A: policy plus SQL tests. Agent B: no change if A lands first |
| D7 | **Accounting-firm sign-up stays hidden.** Organisation scoping (`member_has()` per organisation) is an Agent A item that must merge before any second firm is onboarded. It is not built now. | Agent A logs it as a blocking item before multi-firm work |
| D8 | **PR #8 (brand lockups, "KIMA OS") waits for the owner to confirm the brand and the product name.** After that, Agent B rebuilds it on a fresh `agent-b/*` branch, sends the string changes in `app/api/**` and `lib/auth-mail.ts` to Agent A, and closes #8. | **Open:** the owner must confirm the brand and the name. Nobody touches #8 until then |
