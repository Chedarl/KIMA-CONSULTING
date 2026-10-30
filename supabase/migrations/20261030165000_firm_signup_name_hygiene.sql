-- D1 / OD-2: firm look-alike names are a product-integrity key.
-- This is NOT an ONECCA number format or an official legal-identity check.
-- Case, accents, punctuation, spacing, and common labels are normalized;
-- words that convey the firm's name stay part of the key.
create or replace function private.firm_name_key(p_name text)
returns text
language sql immutable strict
set search_path to ''
as $$
  with translated as (
    select lower(translate(p_name,
      'ÀÁÂÃÄÅàáâãäåÇçÉÈÊËéèêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝŸýÿ',
      'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYYyy')) as value
  ), normalized as (
    select regexp_replace(value, '[^a-z0-9]+', ' ', 'g') as value
      from translated
  ), without_labels as (
    select regexp_replace(value,
      '\m(cabinet|societe|s a r l|sarl|s a|sa|et associes|associes|associe)\M',
      ' ', 'g') as value
      from normalized
  )
  select nullif(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')), '')
  from without_labels
$$;

comment on function private.firm_name_key(text) is
  'Deterministic firm-name collision key (OD-2); not a legal identity validation.';

-- KIMA's own vendor organisation is kind=kima and must not collide with
-- an accounting firm. Future sign_up_firm() must reject a null name key.
create unique index if not exists organizations_firm_name_key_unique
  on public.organizations (private.firm_name_key(name))
  where kind = 'firm';
