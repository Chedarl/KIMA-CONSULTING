-- A suspended firm stops working, and an unverified one says so (R-57, step 1+2).
--
-- The owner chose instant sign-up over admin approval and named the safeguards
-- that replace the gate. Two of them are schema: every firm starts
-- **unverified** with that label shown to clients choosing one, and a KIMA
-- admin can **suspend** a fake firm after the fact. This migration adds the
-- three columns and, in the same change, makes them mean something.
--
-- WHY NOT THE COLUMNS ALONE. `suspended_at` on `organizations` changes nothing
-- by itself: `current_member_org()`, `current_firm_role()`, `member_has()` and
-- `member_has_in_org()` all resolve through `firm_members` and would not
-- notice, so a suspended firm would keep working exactly as before and the
-- column would be a comment. Suspension has to be inside those four helpers,
-- which is where every policy in the product asks its question. That is the
-- whole risk in this change, so it carries a negative test (T-145 .. T-150) and
-- the entire suite is the control.
--
-- These four are the hinge of every tenant-scoped policy, so each is re-created
-- with one added join and nothing else touched. A firm member of a suspended
-- firm now resolves to no organisation, no role and no capability -- the same
-- state as someone who is not a member at all, which is already a state every
-- policy handles.
--
-- WHAT `verification_status` MEANS, AND WHAT IT DOES NOT.
-- Two values, 'unverified' and 'verified'. It records that a KIMA admin checked
-- the firm's registration number against the register -- nothing more. It is
-- **not** a statement that the holder is a qualified expert-comptable, and
-- nothing in the product may present it as one. There is no third 'rejected'
-- value on purpose: a firm that fails the check is suspended, which stops it
-- working, where a status value would only relabel it.
--
-- The registration number is UNIQUE and non-blank here, and **its format is
-- not checked**. CLAUDE.md requires a legal source, a jurisdiction and an
-- effective date for every rule, and no verified ONECCA numbering format is on
-- file -- so a regex here would be an invented regulatory rule wearing a
-- CHECK constraint. Uniqueness and non-blankness are not rules about Cameroon,
-- they are rules about this table, which is why they can ship now. The format
-- follows `cameroon-rule-corpus-research.md`, once sourced.

alter table public.organizations
  add column if not exists registration_number text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists suspended_at timestamptz;

alter table public.organizations
  drop constraint if exists organizations_verification_status_known;
alter table public.organizations
  add constraint organizations_verification_status_known
  check (verification_status in ('unverified', 'verified'));

comment on column public.organizations.registration_number is
  'The firm''s professional registration number, unique and non-blank. Its '
  'FORMAT is deliberately unchecked: no verified numbering rule is on file, and '
  'inventing one here would be an unsourced regulatory rule in a CHECK '
  'constraint. R-57.';
comment on column public.organizations.verification_status is
  'Whether a KIMA admin has checked this firm''s registration number against '
  'the register. Nothing more: it is not a statement that the holder is a '
  'qualified expert-comptable and may not be presented as one. R-57.';
comment on column public.organizations.suspended_at is
  'Set by a KIMA admin to stop a firm working. Read inside '
  'private.current_member_org(), current_firm_role(), member_has() and '
  'member_has_in_org(), so a suspended firm''s members resolve to no '
  'organisation, no role and no capability. R-57.';

-- Normalised and partial, the same shape as taxpayers_niu_is_one_client: a firm
-- recorded before this column existed has none, and absent is not a collision.
create unique index if not exists organizations_registration_number_is_one_firm
  on public.organizations (upper(btrim(registration_number)))
  where registration_number is not null and btrim(registration_number) <> '';

-- ---------------------------------------------------------------------------
-- Suspension, inside the four helpers every policy reaches.
-- ---------------------------------------------------------------------------

create or replace function private.current_member_org() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select fm.organization_id
    from firm_members fm
    join organizations o on o.id = fm.organization_id and o.suspended_at is null
   where fm.auth_user_id = auth.uid() and fm.active
   limit 1
$$;

create or replace function private.current_firm_role() returns firm_role
language sql stable security definer set search_path to 'public' as $$
  select fm.role
    from firm_members fm
    join organizations o on o.id = fm.organization_id and o.suspended_at is null
   where fm.auth_user_id = auth.uid() and fm.active
   limit 1
$$;

create or replace function private.member_has(cap text, tp uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
      from firm_members fm
      join organizations o on o.id = fm.organization_id and o.suspended_at is null
      join role_capabilities rc on rc.role = fm.role
      join engagements e
        on e.organization_id = fm.organization_id
       and e.taxpayer_id = tp
       and e.revoked_at is null
       and e.status in ('accepted', 'authorized')
     where fm.auth_user_id = auth.uid()
       and fm.active
       and rc.capability = cap
  )
$$;

create or replace function private.member_has_in_org(cap text, org uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
      from firm_members fm
      join organizations o on o.id = fm.organization_id and o.suspended_at is null
      join role_capabilities rc on rc.role = fm.role
     where fm.auth_user_id = auth.uid()
       and fm.active
       and fm.organization_id = org
       and rc.capability = cap
  )
$$;

-- private.member_has(cap) needs no change: it asks current_firm_role(), which
-- now answers null for a suspended firm, so the capability lookup finds
-- nothing. Stated rather than left to be noticed.

-- ---------------------------------------------------------------------------
-- The label the owner asked clients to see, and the firms they may choose.
-- ---------------------------------------------------------------------------
-- R-55 put every firm's id and name behind one public lookup. The label joins
-- it here, which is the whole of what that risk left open. A suspended firm
-- leaves the directory: it cannot work, so offering it as a choice would be a
-- dead end rather than a disclosure.
-- Dropped and re-created rather than replaced: CREATE OR REPLACE cannot change
-- a function's return type, and this one gains a column.
drop function if exists public.firm_directory();

create function public.firm_directory()
returns table (id uuid, name text, verification_status text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.id, o.name, o.verification_status
    from organizations o
   where o.suspended_at is null
   order by o.name
$$;

comment on function public.firm_directory() is
  'Every working firm''s id, name and verification label, and nothing else, to '
  'anyone -- the one public route to a firm''s name now that the whole record '
  'is readable only inside the firm. Suspended firms are absent. SECURITY '
  'DEFINER because the table''s policies deliberately refuse anon; narrow by '
  'construction: no arguments, no writes, three columns. R-55, R-57.';

revoke execute on function public.firm_directory() from public;
grant execute on function public.firm_directory() to anon, authenticated;
