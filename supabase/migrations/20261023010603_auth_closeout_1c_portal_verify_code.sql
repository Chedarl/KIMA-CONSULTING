create function portal_verify_code(p_reference uuid, p_code text)
returns table (
  ok boolean,
  reason text,
  taxpayer_id uuid,
  display_name text,
  contact_id uuid,
  contact_email text
)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare acct record;
begin
  select pa.*, c.id as cid, c.email as cemail
    into acct
  from portal_accounts pa
  left join contacts c on c.id = pa.contact_id
  where pa.id = p_reference;

  if acct.id is null then
    return query select false, 'unknown_reference', null::uuid, null::text, null::uuid, null::text;
    return;
  end if;
  if acct.failed_attempts >= 5 then
    return query select false, 'too_many_attempts', null::uuid, null::text, null::uuid, null::text;
    return;
  end if;
  if acct.otp_hash is null or acct.otp_expires_at is null or acct.otp_expires_at < now() then
    return query select false, 'expired', null::uuid, null::text, null::uuid, null::text;
    return;
  end if;

  if acct.otp_hash <> encode(digest(coalesce(p_code,'') || acct.id::text, 'sha256'), 'hex') then
    update portal_accounts set failed_attempts = failed_attempts + 1 where id = acct.id;
    return query select false, 'wrong_code', null::uuid, null::text, null::uuid, null::text;
    return;
  end if;

  update portal_accounts
  set otp_hash = null, otp_expires_at = null, failed_attempts = 0, last_sign_in_at = now()
  where id = acct.id;

  return query select true, null::text, acct.taxpayer_id, acct.display_name, acct.cid, acct.cemail;
end $$;

grant execute on function portal_verify_code(uuid, text) to anon, authenticated;

revoke execute on function portal_sign_in(text, text) from public, anon, authenticated;

comment on function portal_sign_in(text, text) is
  'REVOKED (R-36). Use portal_issue_code + portal_verify_code. Synthetic history only.';
