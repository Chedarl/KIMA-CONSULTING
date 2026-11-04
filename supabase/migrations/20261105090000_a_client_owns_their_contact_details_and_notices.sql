-- A client can correct their own contact details and choose which files
-- send them notices.
--
-- WHAT WAS MISSING
-- public.contacts carries a read policy for the person themselves
-- (auth_user_id = auth.uid()) and, since 20261104140000, read/update/delete
-- for the firm that recorded them. The person had no write of any kind. A
-- client whose phone number changed could see the wrong number on their own
-- profile screen and had no way to fix it: the only route was to telephone
-- the firm using the number the firm could not reach them on.
--
-- public.contact_account_links.notifications has existed since
-- 20261022065033 and is per-link by design -- the same person may want
-- notices for their company and not for their personal file. Only the firm
-- could set it. The column recorded a preference its owner could not express.
--
-- WHY FUNCTIONS AND NOT UPDATE POLICIES
-- An update policy on contacts would let the caller write every column the
-- grant covers, and two of those columns are not theirs to change:
--
--   full_name       is half of the sign-in identifier (name + taxpayer
--                   number). A client who renamed themselves here would lock
--                   themselves out of the one-time-code route, and the firm's
--                   address book would disagree with the DGI's records.
--   organization_id is which firm recorded them. Writable, it is a tenant
--                   escape: a row moved into another organisation.
--
-- Postgres has no per-column RLS. A definer function with two parameters is
-- the narrowest thing that exists, and it cannot widen by accident later --
-- adding a column to contacts does not add it to the signature.
--
-- THE ONE-TIME CODE CONSEQUENCE, STATED PLAINLY
-- The 8-digit sign-in code is delivered to contacts.email. A client who
-- changes that email changes where their future codes arrive. That is correct
-- -- it is how a person who has lost an address regains access -- but it is
-- also an account-recovery vector for anyone holding a live session. So the
-- change is not silent: every email change writes an audit_events row with
-- the old and new values, which the firm's activity view already reads. The
-- firm sees that it happened and when. Nothing here hides a takeover.
--
-- WHAT IS DELIBERATELY ABSENT
-- No delete. A client cannot remove their own contact row: it is the firm's
-- record of a relationship, and the engagement is what ends a relationship.
-- No portal_access write -- who may sign in is the firm's decision.
-- No full_name write, for the reason above.

-- ---------------------------------------------------------------------------
-- 1. The caller's own contact row.
--
-- One auth user resolves to at most one contact: auth_user_id is written by
-- the verify-code endpoint onto exactly the contact that signed in. The
-- limit 1 is defensive, not expected.
-- ---------------------------------------------------------------------------
create or replace function private.my_contact_id()
returns uuid
language sql stable security definer set search_path to 'public'
as $fn$
  select c.id from public.contacts c where c.auth_user_id = auth.uid() limit 1;
$fn$;

revoke all on function private.my_contact_id() from public, anon;
grant execute on function private.my_contact_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Correcting one's own email and phone.
--
-- Returns the stored row so the caller renders what the database holds, not
-- what it hoped it wrote. A null parameter leaves that field alone; an empty
-- string clears it, which is a real intention ("I have no landline") and is
-- distinct from "do not touch this".
-- ---------------------------------------------------------------------------
create or replace function public.update_my_contact_details(
  p_email text default null,
  p_phone text default null
)
returns table (email text, phone text)
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_contact_id uuid := private.my_contact_id();
  v_before     public.contacts;
  v_after      public.contacts;
  v_email      text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if v_contact_id is null then
    raise exception 'no_contact' using hint = 'This session is not bound to a contact.';
  end if;

  -- An address that cannot receive a sign-in code is worse than none: it
  -- would silently strand the client. Shape only -- deliverability is the
  -- mail provider's answer, not a constraint's.
  if p_email is not null and v_email is not null
     and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'bad_email' using hint = 'Enter an address of the form name@example.cm.';
  end if;

  select * into v_before from public.contacts where id = v_contact_id;

  update public.contacts c
     set email = case when p_email is null then c.email else v_email end,
         phone = case when p_phone is null then c.phone else nullif(btrim(p_phone), '') end
   where c.id = v_contact_id
  returning * into v_after;

  -- The firm is told when the sign-in address moves. A phone correction is
  -- housekeeping; an email change is where the next code goes.
  if v_after.email is distinct from v_before.email then
    insert into public.audit_events
      (organization_id, actor, action, resource_type, resource_id, before, after)
    values
      (v_after.organization_id, 'taxpayer', 'contact.email_changed', 'contact', v_contact_id,
       jsonb_build_object('email', v_before.email),
       jsonb_build_object('email', v_after.email));
  end if;

  return query select v_after.email, v_after.phone;
end;
$fn$;

revoke all on function public.update_my_contact_details(text, text) from public, anon;
grant execute on function public.update_my_contact_details(text, text) to authenticated;

comment on function public.update_my_contact_details(text, text) is
  'A client corrects their own email and phone. Never full_name (half the sign-in identifier) nor organization_id (which firm holds the record). An email change is audited: that is where the next one-time code goes.';

-- ---------------------------------------------------------------------------
-- 3. Choosing which files send notices.
--
-- Scoped to the caller's own links. A link to a taxpayer the caller is not a
-- contact for matches no row and the update affects nothing -- it does not
-- raise, because "you have no such link" and "you turned it off" are the same
-- outcome from the caller's side, and distinguishing them leaks whether a
-- link exists.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_file_notifications(
  p_taxpayer_id uuid,
  p_on boolean
)
returns boolean
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_contact_id uuid := private.my_contact_id();
  v_set        boolean;
begin
  if v_contact_id is null then
    raise exception 'no_contact' using hint = 'This session is not bound to a contact.';
  end if;

  update public.contact_account_links l
     set notifications = p_on
   where l.contact_id = v_contact_id
     and l.taxpayer_id = p_taxpayer_id
  returning l.notifications into v_set;

  return coalesce(v_set, false);
end;
$fn$;

revoke all on function public.set_my_file_notifications(uuid, boolean) from public, anon;
grant execute on function public.set_my_file_notifications(uuid, boolean) to authenticated;

comment on function public.set_my_file_notifications(uuid, boolean) is
  'A client turns notices on or off for one of their own tax files. Per link, because the same person may want them for a company and not for a personal file.';
