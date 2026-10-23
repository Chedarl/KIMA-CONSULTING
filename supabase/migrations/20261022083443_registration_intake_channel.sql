-- The intake channel was in the architecture but not in the table.
--
-- It matters more than a provenance label: the channel decides what we may
-- assume. An applicant who walked into an office has been seen in person and
-- handed over paper; one who typed into a form has not been seen at all. The
-- same record with the same status means different things depending on how it
-- arrived, and the triage queue has to show that.
--
-- It also carries the economics decision: assisted and physical intake is
-- offered on annual DSF and advisory engagements only, because a routine
-- declaration at 5,000-7,500 XAF cannot absorb staff scanning time.

alter table public.registrations
  add column if not exists intake_channel text not null default 'online';

do $$ begin
  alter table public.registrations
    add constraint registrations_intake_channel_known
    check (intake_channel in ('online', 'whatsapp', 'agency', 'referral'));
exception when duplicate_object then null; end $$;

comment on column public.registrations.intake_channel is
  'How the application reached us. Decides what may be assumed about identity: an agency applicant was seen in person, an online one was not.';

-- Which language to answer them in. Asked once, at the only moment the
-- applicant is definitely present, rather than guessed from a browser header
-- that is wrong as often as it is right in a bilingual country.
alter table public.registrations
  add column if not exists preferred_language text not null default 'fr';

do $$ begin
  alter table public.registrations
    add constraint registrations_language_known
    check (preferred_language in ('fr', 'en'));
exception when duplicate_object then null; end $$;

create index if not exists registrations_channel_idx
  on public.registrations (intake_channel);
