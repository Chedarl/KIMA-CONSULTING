create function firm_verify_code(p_reference uuid, p_code text)
returns table (
  ok boolean,
  reason text,
  member_id uuid,
  person_label text,
  email text,
  role firm_role
)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare mem record;
begin
  select * into mem from firm_members where id = p_reference;

  if mem.id is null then
    return query select false, 'unknown_reference', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;
  if not mem.active then
    return query select false, 'inactive', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;
  if mem.failed_attempts >= 5 then
    return query select false, 'too_many_attempts', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;
  if mem.otp_hash is null or mem.otp_expires_at is null or mem.otp_expires_at < now() then
    return query select false, 'expired', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;

  if mem.otp_hash <> encode(digest(coalesce(p_code,'') || mem.id::text, 'sha256'), 'hex') then
    update firm_members set failed_attempts = failed_attempts + 1 where id = mem.id;
    return query select false, 'wrong_code', null::uuid, null::text, null::text, null::firm_role;
    return;
  end if;

  update firm_members
  set otp_hash = null, otp_expires_at = null, failed_attempts = 0
  where id = mem.id;

  return query select true, null::text, mem.id, mem.person_label, mem.email, mem.role;
end $$;

grant execute on function firm_verify_code(uuid, text) to anon, authenticated;
