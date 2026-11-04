-- The engagement letter a client accepts is kept.
--
-- WHAT WAS MISSING
-- engagement_templates.letter (20261103150000) holds a firm's letter: scope,
-- terms, the basis of the fee. instantiate_engagement_template reads exactly
-- one key out of it --
--
--   insert into public.engagements (..., scope_note)
--   values (..., v_row.letter ->> 'scope');
--
-- -- and discards the rest. So a client accepting an engagement was accepting
-- a single line of scope_note. There was no document to read before agreeing,
-- and nothing afterwards saying what had been agreed to.
--
-- The acceptance machinery itself is sound and is not touched: a client
-- accepts (20261030100000), only once, without being able to alter the terms
-- in the same statement, and a row claiming acceptance must carry its date.
-- What was absent is the thing being accepted.
--
-- WHY A SNAPSHOT AND NOT A POINTER TO THE TEMPLATE
-- A template is edited. If the engagement pointed at one, the terms a client
-- agreed to in March would silently become the terms the firm wrote in
-- September, and the record would no longer say what happened. A letter is
-- written once, at issue, from whatever the template said then. A correction
-- is a new version, never an edit -- enforced by a trigger, not by
-- convention, because the whole value of the row is that it cannot move.
--
-- WHAT FOLLOWS THIS
-- Recording WHICH letter an acceptance was given against is a change to
-- private.engagements_grant_guard, and goes in its own migration beside its
-- own test. This one is the document and the rule that it cannot move.

create table public.engagement_letters (
  id              uuid primary key default gen_random_uuid(),
  engagement_id   uuid not null references public.engagements(id) on delete cascade,
  -- Denormalised so a policy can scope without joining engagements, which is
  -- itself policy-scoped: the join would decide visibility twice.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  taxpayer_id     uuid not null references public.taxpayers(id) on delete cascade,
  version         int  not null default 1 check (version >= 1),
  -- The letter as issued. jsonb and not text: the template already stores it
  -- that way, and a letter is sections, not a blob.
  body            jsonb not null default '{}'::jsonb,
  -- Snapshots of the terms as they stood at issue. The engagement's own
  -- columns keep moving; these do not.
  scope           text,
  fee_xaf         integer check (fee_xaf is null or fee_xaf >= 0),
  issued_at       timestamptz not null default now(),
  issued_by       uuid references public.firm_members(id) on delete set null,
  superseded_at   timestamptz,
  unique (engagement_id, version)
);

comment on table public.engagement_letters is
  'The engagement letter as issued, snapshotted from the template so the terms a client accepted cannot be edited afterwards. A correction is a new version.';

create index engagement_letters_engagement_idx
  on public.engagement_letters (engagement_id, version desc);

alter table public.engagement_letters enable row level security;

-- ---------------------------------------------------------------------------
-- A letter does not move after it is issued.
--
-- Only superseded_at may change, and only from null. Everything else is the
-- record of what was put in front of the client.
-- ---------------------------------------------------------------------------
create or replace function private.engagement_letter_is_immutable()
returns trigger
language plpgsql
set search_path to 'private', 'public'
as $fn$
begin
  if (new.engagement_id, new.organization_id, new.taxpayer_id, new.version,
      new.body, new.scope, new.fee_xaf, new.issued_at, new.issued_by)
     is distinct from
     (old.engagement_id, old.organization_id, old.taxpayer_id, old.version,
      old.body, old.scope, old.fee_xaf, old.issued_at, old.issued_by) then
    raise exception 'an issued letter is not edited; issue a new version'
      using errcode = '42501';
  end if;
  if old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at then
    raise exception 'a letter already superseded stays superseded'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create trigger engagement_letter_is_immutable
  before update on public.engagement_letters
  for each row execute function private.engagement_letter_is_immutable();

-- ---------------------------------------------------------------------------
-- Who sees a letter.
--
-- The firm that issued it, and the client it was issued to. A letter is the
-- one document in this schema whose whole purpose is to be read by the other
-- side, so the client read is the point, not a concession.
-- ---------------------------------------------------------------------------
create policy "letter scoped read" on public.engagement_letters for select
  to authenticated
  using (
    private.can_see_taxpayer(taxpayer_id)
    or private.member_has_in_org('case.view', organization_id)
  );

create policy "firm issues letters" on public.engagement_letters for insert
  to authenticated
  with check (private.member_has_in_org('case.advance', organization_id));

-- Update exists only so a firm can supersede; the trigger above decides what
-- a successful update may have changed.
create policy "firm supersedes letters" on public.engagement_letters for update
  to authenticated
  using (private.member_has_in_org('case.advance', organization_id))
  with check (private.member_has_in_org('case.advance', organization_id));
