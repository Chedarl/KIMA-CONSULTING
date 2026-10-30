-- Phase 2 R-48 follow-through: public CONTACT requests are not firm applications.
-- Every firm application must choose its firm; a general question to KIMA
-- remains receivable without inventing a recipient firm.
-- No anonymous or firm-level read access. No status/authorization transition.
create table public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  contact_email text,
  contact_phone text,
  inquiry_kind text not null,
  preferred_language text not null,
  note text,
  received_at timestamptz not null default now(),
  constraint inquiry_name_hygiene check
    (char_length(btrim(contact_name)) between 2 and 120),
  constraint inquiry_kind_known check
    (inquiry_kind in ('individual','business')),
  constraint inquiry_language_known check
    (preferred_language in ('fr','en')),
  constraint inquiry_contact_required check
    (nullif(btrim(coalesce(contact_email,'')),'') is not null
      or nullif(btrim(coalesce(contact_phone,'')),'') is not null),
  constraint inquiry_email_hygiene check
    (contact_email is null or
      (char_length(contact_email) between 5 and 254 and
       contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
  constraint inquiry_phone_hygiene check
    (contact_phone is null or char_length(contact_phone) between 8 and 25),
  constraint inquiry_note_hygiene check
    (note is null or char_length(note) <= 2000)
);
comment on table public.contact_inquiries is
  'General contact request to KIMA, distinct from a firm-scoped registration. '
  'Public may submit but never retrieve; only a bound KIMA administrator '
  'can read. No default or fabricated firm association.';

alter table public.contact_inquiries enable row level security;
revoke all on public.contact_inquiries from public, anon, authenticated;

-- A visitor fills in the message, and nothing else. A table-wide INSERT grant
-- would also hand them `id` and `received_at` -- the two columns the server is
-- supposed to set -- so a submitter could choose their own primary key or
-- backdate when KIMA received their message. Granting column by column leaves
-- both to their defaults, unsettable rather than merely unexpected.
--
-- Column grants cannot be carved out of a table-wide one (Postgres accepts
-- `revoke insert (col)` and does nothing), so the table grant has to go first.
-- Same shape as the firm_members fix in 20261022163452.
grant insert (contact_name, contact_email, contact_phone, inquiry_kind,
              preferred_language, note)
  on public.contact_inquiries to anon, authenticated;
grant select on public.contact_inquiries to authenticated;

-- PostgREST exposes direct INSERT; a web route's throttle is not enough.
-- Keep ALL Data API writes disabled until a reviewed abuse-control layer is
-- deployed. The default OFF flag cannot be enabled as part of Phase 2 release.
insert into public.app_flags(key, enabled, note)
values ('allow_public_contact_inquiries', false,
  'OFF until direct Data API inserts are abuse-controlled and owner approved.')
on conflict (key) do nothing;
-- This helper is in an unexposed schema. RLS needs EXECUTE as the caller.
grant execute on function private.flag_enabled(text) to anon, authenticated;
create policy "public contact inquiries require abuse gate"
  on public.contact_inquiries for insert to anon, authenticated
  with check (private.flag_enabled('allow_public_contact_inquiries'));

create policy "only KIMA administrators view general inquiries"
  on public.contact_inquiries for select to authenticated
  using (exists (
    select 1 from public.firm_members fm
    join public.organizations o on o.id = fm.organization_id
    where fm.id = (select private.current_member_id())
      and fm.role = 'kima_admin'::public.firm_role
      and fm.active and o.kind = 'kima' and o.suspended_at is null
  ));
