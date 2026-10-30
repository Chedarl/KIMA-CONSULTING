-- Phase 3 draft: authenticated, company-scoped invitation inbox.
-- UUID identifies the invitation, but never authorizes acceptance by itself.
create table public.engagement_invitations (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('firm_to_taxpayer','taxpayer_to_firm')),
  organization_id uuid not null references public.organizations(id),
  taxpayer_id uuid not null references public.taxpayers(id),
  engagement_id uuid references public.engagements(id),
  initiated_by uuid not null references auth.users(id),
  recipient_user_id uuid not null references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','revoked','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  check ((status = 'pending') = (decided_at is null)),
  check (initiated_by <> recipient_user_id)
);

create unique index engagement_invite_one_pending
  on public.engagement_invitations(organization_id,taxpayer_id,direction)
  where status='pending';

alter table public.engagement_invitations enable row level security;
revoke all on public.engagement_invitations from anon, authenticated;
grant select on public.engagement_invitations to authenticated;
create policy "invitation participants may read" on public.engagement_invitations
  for select to authenticated
  using (initiated_by = auth.uid() or recipient_user_id = auth.uid());

comment on table public.engagement_invitations is
  'Invitation inbox: two authenticated participants, one company, 14-day '
  'expiry and one recorded decision. Direct writes are denied. The RPCs '
  'validate each caller before updating engagements. Email delivery is separate.';
