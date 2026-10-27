-- Part 1a. `create or replace` cannot widen a function's OUT parameters, and
-- portal_verify_code already exists returning (ok, reason, taxpayer_id,
-- display_name) from 20261022181734. Drop first, then recreate wider.
drop function if exists portal_issue_code(text, text);
drop function if exists portal_verify_code(uuid, text);
drop function if exists firm_issue_code(text);
drop function if exists firm_verify_code(uuid, text);

create extension if not exists pgcrypto;

alter table firm_members
  add column if not exists otp_hash text,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists failed_attempts int not null default 0;

-- Demo partner needs an address for OTP. Synthetic only.
update firm_members
set email = coalesce(email, 'irina@demo.kima.cm')
where lower(btrim(person_label)) = 'irina' and active;
