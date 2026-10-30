# Hand review of PR #29, including the two commits the automated review never saw

- **Reviewer:** Agent A (security and data integrity)
- **Subject:** `Chedarl/KIMA-CONSULTING#29`, merged 30 Oct 2026 05:01 Douala as `029288a`
- **Why by hand:** the last two commits — `dc33c25` (the new
  `documents_notify_firm_intake` trigger) and `fd47aa3` (the test that accounts for it) —
  landed about three minutes after the automated review, so the review never covered
  them. A fresh automated review cannot be requested against a merge commit, so this is
  the alternative the QA note offered.
- **Method:** the 49 migrations on `main` replayed from scratch against a throwaway
  Postgres with the Supabase surface shimmed, the full pgTAP suite run against the
  replay, and the specific properties below probed with SQL as `authenticated`. Reading
  the diff alone would not have settled the recursion or privilege questions.

## The trigger: no defect found

`private.signal_firm_intake_document_change()`, `after insert or update or delete on
public.documents for each row`.

| Checked | Result |
|---|---|
| Recursion — it writes `document_requests`; does anything on that table write back to `documents`? | **No.** The only non-internal trigger on `document_requests` is `client_request_update_guard`, a BEFORE UPDATE validator that writes nothing. |
| Does it break the client's own request updates? It is SECURITY DEFINER, so `client_request_update_guard` fires with `current_user` = the function owner while `auth.uid()` is still the client's, which misses that guard's trusted-path exemption | **No.** The guard then falls through to its column comparison, and `updated_at` is not in the compared list, so it returns `new`. Verified: the client upload tests in `p0_storage_test.sql` and `p0_writes_test.sql` pass against the replay. |
| Does the definer update widen what a caller can touch? | **No further than the document write already did.** It is scoped `where id = linked_request and taxpayer_id = linked_taxpayer`, and both document INSERT policies are taxpayer-scoped, so the request it touches belongs to the same taxpayer the caller was already allowed to write a document for. |
| `request_id` pointing at another taxpayer's request | **Refused**, `23514`. This is a real integrity guard the diff adds, and `documents.taxpayer_id` is NOT NULL, so the comparison is always well defined. |
| Deleting a request while documents reference it | **Safe.** `documents_request_id_fkey` is `ON DELETE SET NULL`, which fires the trigger as an UPDATE whose `update ... where id = <deleted>` matches no rows. |
| `set search_path = ''` with everything schema-qualified | Correct. |
| `revoke execute ... from public, anon, authenticated` on the trigger function | Harmless, but not the boundary — EXECUTE is not checked when a trigger fires. Living in `private` is what keeps it off the API, which is the lesson `20261030020000` already wrote down. |

Two notes, neither a defect:

- The cross-taxpayer check sits in an **AFTER** trigger, so the row is written and then
  rolled back. A BEFORE trigger would refuse before the write. Cosmetic.
- The AFTER trigger returns `new` / `old`; the return value is ignored in an AFTER
  trigger. Harmless.

## The real finding: identity by display name

Not in those two commits — in `609c944`, which the automated review *did* see.

`public.current_firm_intake_identity()` resolved the signed-in member with

```sql
where fm.person_label = private.current_member_label()
```

and `private.current_member_label()` resolves that label from `auth.uid()`. The identity
was in hand and was discarded, then looked up again through a display name. It holds
today only because `firm_members_person` was UNIQUE platform-wide on
`lower(btrim(person_label))`, so no two firms could employ a Marie Atangana.

**The severity, stated precisely.** The function `returns table`, so with two same-named
members it returns both rows, and `components/live/intake-panel.tsx` takes `[0]`. It then
checks `member.member_id !== memberId` against the id the firm session was issued at
sign-in and throws if they disagree. So a duplicate name does **not** leak another firm's
intake queue — it breaks the intake panel for one of the two people. A phase 2 denial of
service, not a cross-tenant read. Worth correcting, because "isolation hole" and "phase 2
will break" call for different urgency, and this is the second.

The audit policy added in the same commit repeats the same name match. It is bounded by
`fm.organization_id = audit_events.organization_id`, and within one organisation the
index made duplicates impossible, so it was safe — by the organisation check, not by the
name. That is exactly why the name match looked fine.

**Fixed in `20261030080000`.** `private.current_member_id()` answers with the member's
primary key from `auth.uid()`; the public wrapper joins on it and stays SECURITY INVOKER,
so T-53 keeps holding and `auth_user_id` stays unreadable; the audit policy binds
`actor_member_id = private.current_member_id()`. The index becomes unique **per
organisation** rather than being dropped, because `assigned_to`, `prepared_by` and
`confirmed_by` still hold labels and all of them are already RLS-scoped to one
organisation — that is risk **R-52**. Eight checks in `supabase/tests/firm_identity_test.sql`;
six fail without the migration, starting with the second firm's hire being refused.

## Also found, out of scope of #29

`firm_members` carries `POLICY "members are readable" FOR SELECT USING (true)` with no
role restriction, so any caller — including `anon` — reads every firm's member rows.
Column grants were set deliberately and hold: a probe as a signed-in member got
`permission denied for table firm_members` on `email`, and `auth_user_id`, `otp_hash`,
`otp_expires_at` and `failed_attempts` are equally unreadable. What leaks is the staff
directory itself: id, organisation, `person_label`, `role`, `active`. No credentials, no
client data, and the two-firm suite does not cover it because it asserts over client
records. Whether this is a defect is a product question — is a firm's staff list
confidential? — so it is recorded as **R-53** and not changed.

## Confirmed working, as the QA note said

Each firm sees only its own intake documents (T-65, T-66, T-68, T-69), identity binds to
the signed-in member (T-67, T-70), and receiving a document is still not accepting it.

## Still open from #29, not addressed here

Accept-and-return is not a single transaction. Two statements, so a failure between them
leaves a document accepted with its request not returned. That needs either a
`SECURITY DEFINER` function doing both or an explicit compensating path, and it is a
change to the acceptance flow rather than to identity — its own piece of work.
