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
grant insert on public.contact_inquiries to anon, authenticated;
grant select on public.contact_inquiries to authenticated;

create policy "any visitor can submit a bounded contact inquiry"
  on public.contact_inquiries for insert to anon, authenticated
  with check (true);

create policy "only KIMA administrators view general inquiries"
  on public.contact_inquiries for select to authenticated
  using (exists (
    select 1 from public.firm_members fm
    join public.organizations o on o.id = fm.organization_id
    where fm.id = (select private.current_member_id())
      and fm.role = 'kima_admin'::public.firm_role
      and fm.active and o.kind = 'kima' and o.suspended_at is null
  ));
