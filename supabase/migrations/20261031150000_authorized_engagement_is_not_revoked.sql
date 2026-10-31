-- An engagement cannot say authorized and revoked at the same time.
--
-- engagements_grant_guard refuses clearing revoked_at, but it still accepts
-- status = 'authorized' while revoked_at stays set. That row contradicts
-- itself: the status says the firm may act, the timestamp says the grant
-- ended, and can_see_taxpayer follows revoked_at so the row grants nothing.
-- Measured on production before this migration: zero rows have
-- status = 'authorized' and revoked_at set, so the check does not rewrite
-- history. If a row appears before apply, the migration stops rather than
-- inventing a status.

do $$
begin
  if exists (
    select 1 from public.engagements
     where status = 'authorized' and revoked_at is not null
  ) then
    raise exception
      'an authorized engagement with revoked_at set must be reviewed before this constraint';
  end if;
end $$;

alter table public.engagements
  drop constraint if exists engagements_authorized_is_not_revoked;

alter table public.engagements
  add constraint engagements_authorized_is_not_revoked
  check (status <> 'authorized' or revoked_at is null);

comment on constraint engagements_authorized_is_not_revoked on public.engagements is
  'authorized means the grant is live. A revoked engagement keeps its history '
  'and is never labelled authorized again. Binds every writer, including roles '
  'that bypass the grant guard.';
