create function firm_issue_code(p_email text)
returns table (ok boolean, masked_destination text, reference uuid, code text, destination text)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  mem record;
  issued text;
  masked text;
begin
  select * into mem
  from firm_members
  where lower(btrim(email)) = lower(btrim(p_email))
    and active
  limit 1;

  if mem.id is null or mem.email is null then
    return query select false, null::text, null::uuid, null::text, null::text;
    return;
  end if;

  issued := lpad(
    (mod(('x' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8))::bit(32)::bigint, 100000000))::text,
    8, '0'
  );

  update firm_members
  set otp_hash = encode(digest(issued || id::text, 'sha256'), 'hex'),
      otp_expires_at = now() + interval '10 minutes',
      failed_attempts = 0
  where id = mem.id;

  masked := regexp_replace(mem.email, '^(.).*(.)@', '\1*****\2@');
  return query select true, masked, mem.id, issued, mem.email;
end $$;

revoke all on function firm_issue_code(text) from public, anon, authenticated;
