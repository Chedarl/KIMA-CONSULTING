-- The public contact inbox had no ceiling. `allow_public_contact_inquiries` is
-- enabled, the form posts straight to PostgREST from the browser
-- (`lib/submit-kima-contact.ts`), and the INSERT policy asked only whether the
-- flag was on -- so one script could add rows until the table filled.
--
-- 20261030182000 already said where the fix belongs: "PostgREST exposes direct
-- INSERT; a web route's throttle is not enough." There is no web route to put a
-- throttle in. The ceiling has to be in the database, and this is it.
--
-- Three decisions worth stating, because each rules out something simpler:
--
-- 1. The caller is identified by a KEYED DIGEST of their forwarded IP, never
--    the address itself. A visitor asking KIMA a question has not consented to
--    having their IP filed, and an inbox a KIMA administrator can read would
--    otherwise become a log of who looked. The digest counts submissions and
--    answers nothing else: the salt is random per database and lives in a
--    schema no API role can reach, so the stored value cannot be walked back to
--    an address even by someone holding the whole table.
--
-- 2. The ceiling is an AFTER STATEMENT trigger, not a policy predicate. A
--    `with check` that counted existing rows would read the pre-statement
--    snapshot, so a single bulk insert -- which PostgREST accepts as a JSON
--    array -- would see zero rows for every element and let all of them
--    through. Volatility does not rescue it: a function called during the
--    insert still cannot see rows written by the command it is part of. An
--    AFTER STATEMENT trigger with a transition table sees them, which is the
--    whole point.
--
-- 3. `source_key` is set by DEFAULT and is not in anyone's column grant, so a
--    visitor cannot choose their own bucket. Same discipline `id` and
--    `received_at` are already under.

-- A random per-database salt. Not a secret in the credential sense -- it is the
-- thing that stops the digest being a rainbow-table lookup over the IPv4 space,
-- which a bare sha256 of an address would be.
create table if not exists private.contact_throttle_salt (
  only_row boolean primary key default true,
  salt bytea not null default extensions.gen_random_bytes(32),
  constraint contact_throttle_salt_is_single_row check (only_row)
);
revoke all on private.contact_throttle_salt from public, anon, authenticated;
insert into private.contact_throttle_salt (only_row) values (true)
  on conflict (only_row) do nothing;

comment on table private.contact_throttle_salt is
  'Salt for the contact-inbox source digest. One row. Unreachable from any API '
  'role: if this were readable the digest would be reversible by brute force '
  'over the address space, and the inbox would become an IP log.';

-- The caller's bucket. PostgREST publishes the request headers as a JSON GUC,
-- so the forwarded address is available in SQL; outside PostgREST the GUC is
-- absent and every caller shares one bucket, which is the conservative end --
-- a flood that arrives without the header is still capped, it is just capped
-- together.
create or replace function private.contact_source_key()
returns text
language sql
stable
security definer
set search_path to 'private', 'extensions', 'pg_catalog'
as $$
  select encode(
    extensions.digest(
      (select salt from private.contact_throttle_salt)
        || convert_to(
             coalesce(
               nullif(btrim(split_part(
                 nullif(current_setting('request.headers', true), '')::json
                   ->> 'x-forwarded-for',
                 ',', 1)), ''),
               '(no forwarded address)'),
             'utf8'),
      'sha256'),
    'hex');
$$;

comment on function private.contact_source_key() is
  'Keyed digest of the caller''s first forwarded address, for counting '
  'submissions. Deliberately not reversible and deliberately not the address.';

grant execute on function private.contact_source_key() to anon, authenticated;

alter table public.contact_inquiries
  add column if not exists source_key text not null
    default private.contact_source_key();

comment on column public.contact_inquiries.source_key is
  'Keyed digest of the submitting address, set by DEFAULT and absent from every '
  'column grant so a visitor cannot choose their bucket. Counting only.';

-- The ceiling reads this on every insert, so it earns its index.
create index if not exists contact_inquiries_source_recent
  on public.contact_inquiries (source_key, received_at desc);

create or replace function private.contact_inbox_ceiling()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_key   text;
  v_hour  bigint;
  v_day   bigint;
begin
  -- Only the two API roles a visitor can arrive as are held to the ceiling.
  -- `role` is the GUC PostgREST sets with SET ROLE; entering this SECURITY
  -- DEFINER function changes current_user but leaves that GUC alone, so it
  -- still reports the role the insert actually ran as. The table owner and
  -- service_role are exempt: an administrator importing a backlog is not the
  -- abuse this guards against, and service_role can already write anything.
  if coalesce(current_setting('role', true), 'none')
       not in ('anon', 'authenticated') then
    return null;
  end if;

  for v_key in select distinct source_key from new_rows loop
    select
      count(*) filter (where received_at > now() - interval '1 hour'),
      count(*) filter (where received_at > now() - interval '24 hours')
      into v_hour, v_day
      from public.contact_inquiries
     where source_key = v_key;

    -- 3 an hour and 10 a day. A person with a question sends one, corrects a
    -- typo and sends another; nobody legitimately sends a fourth within the
    -- hour. The numbers are here, in one place, so raising them is a reviewed
    -- change and not a scattered edit.
    if v_hour > 3 then
      raise exception
        'contact inbox: no more than 3 messages an hour from one sender'
        using errcode = '53400',
              hint = 'Try again later, or reach KIMA by phone.';
    end if;

    if v_day > 10 then
      raise exception
        'contact inbox: no more than 10 messages a day from one sender'
        using errcode = '53400',
              hint = 'Try again tomorrow, or reach KIMA by phone.';
    end if;
  end loop;

  return null;
end;
$$;

comment on function private.contact_inbox_ceiling() is
  'Caps public contact submissions per sender per hour and per day. AFTER '
  'STATEMENT with a transition table so one bulk insert cannot slip past a '
  'per-row check reading a stale snapshot.';

drop trigger if exists contact_inquiries_ceiling on public.contact_inquiries;
create trigger contact_inquiries_ceiling
  after insert on public.contact_inquiries
  referencing new table as new_rows
  for each statement
  execute function private.contact_inbox_ceiling();
