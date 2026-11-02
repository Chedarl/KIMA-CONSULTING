# Build status, 3 November 2026 (Agent C)

Honest scorecard against the TaxDome-equivalent CEMAC MVP. **Not 60%.** The
backend is close; the surfaces are not, and two of the six product areas have no
code at all.

## What this session added (all staging-verified, then replayed by CI)

| PR | Surface |
|---|---|
| #211 | `time_entries` — own time only, own organisation, engaged taxpayer |
| #212 | `notification_outbox` + `enqueue_due_reminders()` — deduplicated per case and due date |
| #213 | claim / mark-sent / mark-failed, ten-minute lease, five attempts |
| #214 | `tax_attestations` — ACF/ANR/NIU with a **recorded**, never derived, expiry |
| #215 | `payment_incidents` + evidence, contacts, append-only events; verification requires a named reviewer **and** official evidence |
| #216 | `document_versions` + `document_access_log`; path must start with the taxpayer id |
| #218 | definer census extended to the new helpers |
| #219 | message threads, internal notes (client-invisible), attachments; auto-linked |
| #220 | `documents.visibility` (client/internal), enforced in RLS |
| #221 | firm profile fields; a firm cannot change its own verification or registration number |
| #222 | `dispatch_reminders()` / `complete_reminder()` — service-role only |
| #224 | `case_tasks.assignee_member_id` with a same-firm guard |
| #225 | storage read now refuses objects explicitly marked internal |
| #226 | `firm_task_board` security_invoker read |

## Phase verdict

| Phase | State | Evidence |
|---|---|---|
| 0 Truth reset | done | docs match main |
| 1 Security / isolation | done | 31 tables RLS, private-schema helpers, two-firm probes, clean replay |
| 2 Firm sign-up, staff, approvals | built, **switched off** | `sign_up_firm`, `manage_firm_staff`, `approve_registration`; `allow_firm_signup=false` |
| 3 Invitations | built, unverified end to end | RPCs + both screens |
| 4 Firm workflows | mostly built | cases, queue, billing, calendar, vault, board read added |
| 5 Document exchange | partial | upload wired, versions, audience, access log; **no signed URLs** |
| 6 Incident recovery | schema only | tables + guards; the UI is still the local-state prototype |
| 7 Launch validation | not started | no pilot, no independent review, 1 of 14 rules verified |

## Screens (wireframe set)

Dashboard, documents, messages, clients and calendar exist. **Tasks and settings
have no screen**, and none of the new backend surfaces (incidents, attestations,
time, reminders) is reachable from the UI yet.

## Why this is not 60%

A product is not the sum of its tables. Counting the delivered backend, this is
roughly 65–70% of the *data layer* and 30–35% of the *product*, because a firm
still cannot sign up, upload a file through the screen, or see a reminder. The
gating items are, in order:

1. Firm sign-up activation (flag, entry point, journey test).
2. Tasks and settings screens.
3. Signed download URLs with the access log written.
4. Incident screen wired to `payment_incidents`.
5. `obligation_rules` with a verification audit, so the calendar can show a
   sourced date.
6. DSF bridge and Clarity AI — no code at all.
