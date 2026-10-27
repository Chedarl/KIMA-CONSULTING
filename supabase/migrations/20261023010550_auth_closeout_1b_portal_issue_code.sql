create function portal_issue_code(p_name text, p_identifier text)
returns table (ok boolean, masked_destination text, reference uuid, code text, destination text)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  acct record;
  issued text;
  dest text;
  masked text;
begin
  select pa.id, pa.taxpayer_id, pa.display_name, c.email, c.id as contact_id
    into acct
  from portal_accounts pa
  left join contacts c on c.id = pa.contact_id
  where upper(regexp_replace(pa.identifier, '[^A-Za-z0-9]', '', 'g'))
      = upper(regexp_replace(p_identifier, '[^A-Za-z0-9]', '', 'g'))
    and lower(btrim(pa.display_name)) = lower(btrim(p_name))
    and pa.status = 'active'
  limit 1;

  -- Same answer whether or not the account exists (no NIU oracle).
  if acct.id is null or acct.email is null then
    return query select false, null::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- 8 digits from crypto RNG (~26 bits). Six decimal digits were too small.
  issued := lpad(
    (mod(('x' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8))::bit(32)::bigint, 100000000))::text,
    8, '0'
  );

  update portal_accounts
  set otp_hash = encode(digest(issued || id::text, 'sha256'), 'hex'),
      otp_expires_at = now() + interval '10 minutes',
      failed_attempts = 0
  where id = acct.id;

  dest := acct.email;
  masked := regexp_replace(dest, '^(.).*(.)@', '\1*****\2@');

  return query select true, masked, acct.id, issued, dest;
end $$;

revoke all on function portal_issue_code(text, text) from public, anon, authenticated;

comment on function portal_issue_code(text, text) is
  'Server-only: issues an 8-digit OTP and returns plaintext once for delivery. Never grant to anon/authenticated.';
