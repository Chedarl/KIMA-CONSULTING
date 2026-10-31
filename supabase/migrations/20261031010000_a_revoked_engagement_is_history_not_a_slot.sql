-- A revoked engagement is history, not a slot (R-59, step 1 of 3).
--
-- THE OWNER'S DECISION, 31 Oct: a former client can come back as a brand-new
-- engagement, and the one-engagement rule applies only to engagements that are
-- not revoked.
--
-- What it fixes, measured before the decision was taken. A firm could not take
-- its own former client back by ANY route:
--
--   ROUTE 1 second row  REFUSED: 23505 duplicate key value violates unique
--                                constraint "engagements_organization_id_taxpayer_id_key"
--   ROUTE 2 un-revoke   REFUSED: 42501 a revoked engagement cannot be un-revoked
--   ROUTE 3 status only ACCEPTED -- and granted nothing, because
--                       can_see_taxpayer() and member_has() both filter on
--                       revoked_at is null. The row read `status = authorized`
--                       with revoked_at still set: a record contradicting
--                       itself, which the interface must never show.
--
-- `UNIQUE (organization_id, taxpayer_id)` was the first of those three. It
-- treats the pair as a slot that can be filled once, where an engagement is
-- really an episode in a relationship that may have several. Route 2 stays
-- refused on purpose -- un-revoking would rewrite history, and the audit
-- property that a revocation is permanent is worth keeping. Route 3 is closed
-- separately by `engagements_authorized_needs_a_date` and the immutability
-- guard in 20261030160000.
--
-- So the rule becomes partial: at most one LIVE engagement per firm and client,
-- and as many closed ones as the relationship actually had.
--
-- WHY THIS IS SAFE TO APPLY ON ITS OWN, ahead of the function change that uses
-- it. It only *permits* a second row; nothing creates one yet. The four places
-- that read an engagement by (organization_id, taxpayer_id) --
-- 20261030120000, 20261030140000, 20261030210000 and 20261030220000 -- still
-- find at most one row today, because the only way to get a second is the
-- re-engagement path that step 2 adds. Step 2 scopes those reads to the live
-- row at the same time as it starts creating historical ones.
--
-- No backfill and no data risk: the constraint being dropped guaranteed
-- uniqueness across ALL rows, so every existing pair is already unique within
-- the narrower, partial rule. Verified on production before writing this: one
-- engagement, no duplicates. The only foreign key into this table references
-- `id`, not this constraint, so dropping it breaks no reference.

alter table public.engagements
  drop constraint if exists engagements_organization_id_taxpayer_id_key;

-- Partial, so revoked rows accumulate as history and never occupy the slot.
create unique index if not exists engagements_one_live_per_firm_and_client
  on public.engagements (organization_id, taxpayer_id)
  where revoked_at is null;

comment on index public.engagements_one_live_per_firm_and_client is
  'At most one LIVE engagement per firm and client. Replaces UNIQUE '
  '(organization_id, taxpayer_id), which treated the pair as a slot that '
  'could be filled once and so made taking a former client back impossible. '
  'Revoked rows are history and are deliberately outside this rule. R-59.';
