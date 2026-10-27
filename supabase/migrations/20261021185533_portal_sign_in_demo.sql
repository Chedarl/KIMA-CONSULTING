-- Portal sign-in: name + NIU, as requested by the owner.
--
-- SECURITY POSTURE, STATED HONESTLY. The NIU is not a secret. It is printed on
-- tax documents, it is a mandatory mention on every invoice, and it is the
-- DGI's own Harmony 2 username. Treating it as a password means anyone holding
-- one of the client's invoices can open that client's file. This is acceptable
-- only because this project holds synthetic data only (supabase/README.md,
-- risk R-32). It must not reach real taxpayer data without a second factor.
--
-- The function is deliberately narrow: it returns identity fields only, never
-- the client's documents or declarations. A caller who guesses a name and NIU
-- learns what they already knew, and gains a session the application layer
-- still scopes. It cannot be used to enumerate: no listing, no partial match,
-- and both arguments are required.

create or replace function public.portal_sign_in(p_name text, p_identifier text)
returns table (
  id uuid,
  legal_name text,
  taxpayer_type text,
  niu text,
  tax_centre text,
  tax_regime text,
  profile_verified boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select t.id, t.legal_name, t.taxpayer_type, t.niu,
         t.tax_centre, t.tax_regime, t.profile_verified
  from public.taxpayers t
  where p_name is not null
    and p_identifier is not null
    and length(btrim(p_name)) > 0
    and length(btrim(p_identifier)) > 0
    -- Name match is case- and whitespace-insensitive: a client typing their own
    -- business name will not reproduce our capitalisation.
    and lower(btrim(t.legal_name)) = lower(btrim(p_name))
    -- The NIU is compared with spaces and hyphens stripped, since it is written
    -- inconsistently across documents.
    and t.niu is not null
    and upper(regexp_replace(t.niu, '[^A-Za-z0-9]', '', 'g'))
      = upper(regexp_replace(p_identifier, '[^A-Za-z0-9]', '', 'g'))
  limit 1;
$$;

comment on function public.portal_sign_in(text, text) is
  'Demo portal sign-in on name + NIU. Returns identity fields only, never client documents. The NIU is not a secret: synthetic data only, must not ship to real taxpayer data without a second factor.';

revoke all on function public.portal_sign_in(text, text) from public;
grant execute on function public.portal_sign_in(text, text) to anon, authenticated;
