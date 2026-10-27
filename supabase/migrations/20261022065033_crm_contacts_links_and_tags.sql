-- CRM foundation. TaxDome's account/contact split, corrected for this domain.
--
-- The separation matters here for a reason it does not in the US market: the
-- SARL owner who also files their own IRPP is ONE person with TWO tax files.
-- Collapsing people into accounts makes that person two unrelated records and
-- loses the fact that chasing one of them chases the other. It is also the
-- bridge between the business track and the individual track.
--
-- What is deliberately NOT here: a `tags` row for regime, centre or cadence.
-- Those are derived in lib/crm.ts from verified profile fields. A typed tag
-- would be a second, unverified copy of a classification the reviewer owns,
-- and the two would drift. Tags are for what the firm decides; segments are
-- for what the rules decide.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

comment on table public.contacts is
  'A person. Many-to-many with taxpayers through contact_account_links: one contact may hold several tax files.';

create table if not exists public.contact_account_links (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  taxpayer_id uuid not null references public.taxpayers(id) on delete cascade,
  -- How this person relates to this file, in the firm's words.
  relationship text not null default 'contact'
    check (relationship in ('owner','director','employee','accountant','self','contact')),
  -- Per-link, not per-contact: the same person may receive notices for their
  -- company and not for their personal file, or the reverse.
  portal_access boolean not null default false,
  notifications boolean not null default true,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (contact_id, taxpayer_id)
);

comment on column public.contact_account_links.portal_access is
  'Per-link. Access to one file never implies access to another file the same contact holds — tenant isolation is a correctness requirement.';

-- At most one primary contact per taxpayer, enforced in the database rather
-- than hoped for in the application.
create unique index if not exists contact_account_links_one_primary
  on public.contact_account_links (taxpayer_id)
  where is_primary;

create index if not exists contact_account_links_taxpayer_idx
  on public.contact_account_links (taxpayer_id);
create index if not exists contact_account_links_contact_idx
  on public.contact_account_links (contact_id);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  -- A token name, never a raw hex value: components read design tokens so the
  -- tag stays legible in both themes.
  tone text not null default 'navy' check (tone in ('navy','teal','amber','danger','neutral')),
  created_at timestamptz not null default now(),
  unique (organization_id, label)
);

comment on table public.tags is
  'Free tags the firm applies by hand. Regime, centre and cadence are NOT tags — they are derived from the verified profile in lib/crm.ts.';

create table if not exists public.account_tags (
  taxpayer_id uuid not null references public.taxpayers(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (taxpayer_id, tag_id)
);

alter table public.contacts enable row level security;
alter table public.contact_account_links enable row level security;
alter table public.tags enable row level security;
alter table public.account_tags enable row level security;

-- Demo posture, matching the existing policies: scoped to the seeded taxpayer.
create policy "demo reads own contact links"
  on public.contact_account_links for select
  using (taxpayer_id = public.demo_taxpayer_id());

create policy "demo writes own contact links"
  on public.contact_account_links for insert
  with check (taxpayer_id = public.demo_taxpayer_id());

create policy "demo reads linked contacts"
  on public.contacts for select
  using (
    exists (
      select 1 from public.contact_account_links l
      where l.contact_id = contacts.id
        and l.taxpayer_id = public.demo_taxpayer_id()
    )
  );

create policy "demo inserts contacts"
  on public.contacts for insert with check (true);

create policy "demo reads tags" on public.tags for select using (true);
create policy "demo writes tags" on public.tags for insert with check (true);

create policy "demo reads own account tags"
  on public.account_tags for select
  using (taxpayer_id = public.demo_taxpayer_id());

create policy "demo writes own account tags"
  on public.account_tags for insert
  with check (taxpayer_id = public.demo_taxpayer_id());
