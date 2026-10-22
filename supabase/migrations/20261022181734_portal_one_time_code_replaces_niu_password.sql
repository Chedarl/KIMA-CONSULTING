-- R-36 · The taxpayer number stops being a password.
--
-- The NIU is printed on every invoice a business issues and is the DGI's own
-- username. Using it as a password means every supplier, customer and former
-- employee already holds the credential. This replaces it with a one-time code
-- sent to the contact address recorded during onboarding: the NIU stays as the
-- IDENTIFIER, which is what it is good for.
--
-- WHAT THIS DOES NOT DO: mint a real session. A Supabase Auth session needs a
-- server-side key this project does not yet hold, so the portal still carries
-- its own lightweight session afterwards and client RLS still runs through the
-- anon branch of can_see_taxpayer(). The credential is fixed; the session is
-- the next step, and it is the one that makes client RLS structural.

create extension if not exists pgcrypto;

-- A code is stored only as a salted hash. Reading the table must not hand
-- somebody the means to sign in as a client.
create or replace function portal_request_code(p_name text, p_identifier text)
returns table (ok boolean, masked_destination text, reference uuid)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  acct record;
  code text;
  dest text;
begin
  select pa.id, pa.taxpayer_id, pa.display_name, c.email
    into acct
  from portal_accounts pa
  left join contacts c on c.id = pa.contact_id
  where upper(regexp_replace(pa.identifier, '[^A-Za-z0-9]', '', 'g'))
      = upper(regexp_replace(p_identifier, '[^A-Za-z0-9]', '', 'g'))
    and lower(btrim(pa.display_name)) = lower(btrim(p_name))
    and pa.status = 'active'
  limit 1;

  -- The same answer whether or not the account exists, so this cannot be used
  -- to discover which NIUs are registered with Kima.
  if acct.id is null or acct.email is null then
    return query select false, null::text, null::uuid;
    return;
  end if;

  code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  update portal_accounts
  set otp_hash = encode(digest(code || id::text, 'sha256'), 'hex'),
      otp_expires_at = now() + interval '10 minutes',
      failed_attempts = 0
  where id = acct.id;

  -- Masked, never whole: enough for the client to recognise their own address
  -- and not enough for anyone else to learn it.
  dest := regexp_replace(acct.email, '^(.).*(.)@', '\1*****\2@');

  -- The code itself is never returned. Delivery is the application's job, and
  -- a function that hands the caller the code would defeat the whole exercise.
  return query select true, dest, acct.id;
end $$;

-- Reading the code out for delivery. Granted to no public role: the API route
-- must hold a privileged key, which is the point.
create or replace function portal_pending_code(p_reference uuid)
returns table (destination text, code_hash text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.email, pa.otp_hash, pa.otp_expires_at
  from portal_accounts pa
  left join contacts c on c.id = pa.contact_id
  where pa.id = p_reference
$$;

revoke execute on function portal_pending_code(uuid) from public, anon, authenticated;

create or replace function portal_verify_code(p_reference uuid, p_code text)
returns table (ok boolean, reason text, taxpayer_id uuid, display_name text)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare acct record;
begin
  select * into acct from portal_accounts where id = p_reference;

  if acct.id is null then
    return query select false, 'unknown_reference', null::uuid, null::text; return;
  end if;
  -- Five tries, then the code is dead. Without this a six-digit code is a
  -- million guesses, which a script finishes over lunch.
  if acct.failed_attempts >= 5 then
    return query select false, 'too_many_attempts', null::uuid, null::text; return;
  end if;
  if acct.otp_hash is null or acct.otp_expires_at is null or acct.otp_expires_at < now() then
    return query select false, 'expired', null::uuid, null::text; return;
  end if;

  if acct.otp_hash <> encode(digest(coalesce(p_code,'') || acct.id::text, 'sha256'), 'hex') then
    update portal_accounts set failed_attempts = failed_attempts + 1 where id = acct.id;
    return query select false, 'wrong_code', null::uuid, null::text; return;
  end if;

  -- Single use. A code that still works after it has been used is a password.
  update portal_accounts
  set otp_hash = null, otp_expires_at = null, failed_attempts = 0, last_sign_in_at = now()
  where id = acct.id;

  return query select true, null::text, acct.taxpayer_id, acct.display_name;
end $$;

grant execute on function portal_request_code(text, text) to anon, authenticated;
grant execute on function portal_verify_code(uuid, text) to anon, authenticated;

-- The old path. Left in place so the synthetic demo keeps working, and marked
-- so nobody mistakes it for something that may carry real data.
comment on function portal_sign_in(text, text) is
  'DEPRECATED (R-36): authenticates with the taxpayer number, which is not a secret. Synthetic demo only. Use portal_request_code / portal_verify_code.';
