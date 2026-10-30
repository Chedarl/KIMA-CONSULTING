# C-4 — Phase 4 compliance-case and workflow contract (DRAFT)

**Stacked on:** C-3 invitation contract. No SQL, access expansion, or production release.
A case remains *one taxpayer × one obligation × one period*; never invent a
deadline not supported by `lib/rules.ts` and `resolveDueDate()`.

## Draft RPC boundaries

| Operation | Inputs | Result |
| --- | --- | --- |
| `create_case` | engagement_id, obligation_code, period_code | case_id, due_on?, due_needs_confirmation |
| `assign_case` | case_id, assignee_member_id | task_id or case_id |
| `create_document_request` | case_id, bilingual labels, party, due_on? | request_id |
| `submit_document` | request_id, verified storage object id | received document id |
| `review_document` | document_id, verdict, reason? | verdict + reviewed_at |
| `advance_case` | case_id, expected_revision, stage, supporting evidence | stage, revision |

## Security properties

- RPCs resolve firm membership from Auth + current RLS; never trust
  `organization_id` provided by the browser. All inserts are audited.
- No case is opened unless its engagement is authorized and active for
  the exact taxpayer, obligation scope, and receiving firm.
- Creating the same obligation/period/taxpayer case twice returns a named
  duplicate outcome; use a database uniqueness constraint.
- Assignment respects firm membership and does not confer new case access.
  Unassigned accountants receive permission-denied, not an empty client list.
- A `submitted` document is *received*, **not accepted**. Only an authorized,
  independent reviewer may set accepted/returned/rejected with a reason.
- Stage transitions are enforced in PostgreSQL, not merely in TypeScript.
  `client_approval` demands authenticated taxpayer consent, not a UI flag.
  `cancelled`, `abandoned`, `delivered` are terminal.
- Audit contains actor, firm, case, event, and timestamps; no raw tokens.
- Four independent dimensions: case stage, filing acknowledgement,
  tax-payment evidence, document-review verdict.
- Due dates carry an explicit confidence/confirmation indicator.

## Tests before release

1. Tenant A cannot create/assign/view Taxpayer B's case.
2. An unassigned accountant cannot see or mutate a restricted case.
3. Duplicated case spine is refused; no partial records after failure.
4. Client only submits documents on its own taxpayer's case; cannot accept.
5. Received and accepted are different, even when upload succeeds.
6. Illegal stage advance refused by DB; client approval verified against Auth.
7. All screens: FR/EN, explicit permission-denied and pending states.
8. CI, migration replay, two-firm staging, independent review before merge.

The definitive RPC signatures and the seven-step authority gate are a
follow-up once Phase 3 identity and scope contracts are approved.
