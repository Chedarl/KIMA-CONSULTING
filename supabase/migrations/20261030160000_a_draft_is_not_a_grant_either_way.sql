-- A draft is not a grant, in either direction (R-56, corrected).
--
-- `20261030120000` replaced `taxpayer_engaged_elsewhere()` -- which asked only
-- about *live* engagements, and so let a firm self-authorise onto a client whose
-- previous firm had revoked -- with `taxpayer_held_by_another_firm()`, which
-- asks whether any other organisation has an engagement row at all, at any
-- status. That closed the escalation and opened the opposite fault.
--
-- WHAT IT BROKE, REPRODUCED BEFORE FIXING. Every firm that types a registered
-- NIU into the wizard leaves a draft engagement behind -- that is the
-- `already_registered` path working as designed. Those drafts then counted as
-- holding the taxpayer. Measured against a replayed schema:
--
--   A opened, taxpayer = 813e9bfc-…
--   A revoked, status = revoked
--   C outcome = already_registered        <- a stranger types the NIU
--   drafts on this taxpayer = 1
--   A REFUSED: 42501 / another firm has held this taxpayer;
--              only the taxpayer can bring in a new firm
--
-- Firm A is the client's own former firm. It was refused by a draft belonging to
-- a firm that never held the client, and told that "another firm has held this
-- taxpayer" -- which was not true. Any firm could lock a client's real
-- accountant out by typing their NIU once, and instant sign-up would make that
-- a stranger's privilege rather than a customer's.
--
-- THE PREDICATE THAT IS RIGHT IN BOTH DIRECTIONS is not "currently holds" and
-- not "has a row": it is **ever granted access**. `authorized_at` and
-- `accepted_at` are the record of that, and they are write-once in practice --
-- a draft has both null, and a revoked engagement that was once authorised keeps
-- its `authorized_at`. So the question is asked of those two columns rather than
-- of `status`, which moves.
--
--   * a stranger's draft    -> both null  -> does not hold, A gets its client back
--   * a revoked engagement  -> authorized_at set -> still holds, the escalation
--                                                  review caught stays closed
--
-- Checking the dates rather than the status is also the sturdier of the two: a
-- status is a label that a later migration may extend, where "this engagement
-- was authorised at some point" is a fact about the row.

create or replace function private.taxpayer_held_by_another_firm(tp uuid, org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from engagements e
     where e.taxpayer_id = tp
       and e.organization_id is distinct from org
       -- Ever granted, not currently granting. A draft never granted anything,
       -- so it never blocks; a revoked engagement did, so it always does.
       and (e.authorized_at is not null or e.accepted_at is not null)
  )
$$;

comment on function private.taxpayer_held_by_another_firm(uuid, uuid) is
  'Whether any organisation other than `org` has ever been granted access to '
  'this taxpayer -- authorized_at or accepted_at set, at any status, including '
  'revoked. Deliberately not "currently holds", which would let a firm '
  'self-authorise onto a client whose previous firm revoked; and deliberately '
  'not "has a row", which let any firm lock out a client''s real accountant by '
  'typing their NIU once and leaving a draft. R-56.';
