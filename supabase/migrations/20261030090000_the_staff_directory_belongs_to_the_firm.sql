-- The firm staff directory stops being world-readable (R-53).
--
-- firm_members carried, from 20261022142916 onward:
--
--     create policy "members are readable" on firm_members for select using (true)
--
-- No role restriction and no organisation. So every signed-in caller, and
-- every anonymous one, read every firm's member rows. The owner's decision on
-- 30 Oct made this a defect rather than an open question: only signed-in
-- members of a firm may see that firm's staff, and someone not signed in sees
-- nothing.
--
-- WHAT WAS AND WAS NOT EXPOSED. The column grants were set deliberately in
-- 20261022163452 and they held: `anon` and `authenticated` hold SELECT on seven
-- columns, so `email`, `auth_user_id`, `otp_hash`, `otp_expires_at` and
-- `failed_attempts` were never readable, and a probe as a signed-in member
-- confirmed it ("permission denied for table firm_members" on email). What
-- leaked was the directory: id, organization_id, person_label, role, active,
-- created_at, deactivated_at -- for every firm. No credentials and no client
-- data, which is why this is a confidentiality defect rather than an isolation
-- breach, and why it was carried as a question until the owner answered it.
--
-- WHY A SECURITY DEFINER HELPER IS REQUIRED HERE, not merely tidy. The
-- predicate has to ask "is the caller a member of this row's organisation?",
-- which means reading firm_members from inside a policy *on* firm_members.
-- Written inline that recurses: the policy applies to its own subquery and
-- Postgres raises "infinite recursion detected in policy for relation
-- firm_members". A definer helper reads the table as its owner, with RLS off,
-- which breaks the cycle. It lives in `private` for the reason 20261030020000
-- sets out: that schema is not published, so nothing there is an endpoint.
--
-- SIGN-IN DOES NOT READ THIS TABLE BEFORE A SESSION EXISTS, which is what made
-- the tightening safe, and it was checked rather than assumed. The firm
-- sign-in path is /api/firm/request-code -> firm_issue_code() and
-- /api/firm/verify-code -> firm_verify_code(), both SECURITY DEFINER and
-- callable only by the service role or the auth-codes Edge Function; the
-- route's own firm_members write uses supabaseAdmin(), which bypasses RLS.
-- Nothing anonymous queries the table, so no new narrow function is needed for
-- sign-in. The four reads in components/live/ all run with a firm session and
-- all want their own firm: two select only their own row by id, and two build
-- a staff picker that was always meant to list colleagues.
--
-- A MEMBER WITH NO ORGANISATION becomes unreadable, including to themselves,
-- because `organization_id = null` matches nothing. That is the correct answer
-- and nothing depends on the old one: current_firm_intake_identity() already
-- filtered those rows out, and the engagements screen turns an empty result
-- into its "no organisation" message. Historical rows in that shape exist,
-- which is why T-98 pins the behaviour instead of leaving it to be discovered.

-- ---------------------------------------------------------------------------
-- 1. Which firm is the caller in.
-- ---------------------------------------------------------------------------
create or replace function private.current_member_org()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select organization_id from firm_members
  where auth_user_id = auth.uid() and active
  limit 1
$$;

comment on function private.current_member_org() is
  'The calling firm member''s organisation, or null. Third of the trio with '
  'current_member_id() and current_member_label(): same lookup from auth.uid(), '
  'answering with the organisation. SECURITY DEFINER is load-bearing, not '
  'stylistic: the firm_members SELECT policy calls it, and an inline subquery '
  'over firm_members inside a policy on firm_members recurses.';

revoke execute on function private.current_member_org() from public, anon;
grant execute on function private.current_member_org() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The directory belongs to the firm.
--
-- `to authenticated` is how the anonymous half is answered: with no policy
-- covering `anon`, RLS denies every row to a caller who is not signed in. That
-- is a clean empty result rather than an error, and it means `anon` never
-- executes the helper, so the grant above does not need to include it.
-- ---------------------------------------------------------------------------
drop policy if exists "members are readable" on public.firm_members;

create policy "members are readable" on public.firm_members for select to authenticated
  using (organization_id = private.current_member_org());

comment on table public.firm_members is
  'A firm''s staff. Readable only by signed-in members of the same firm '
  '(R-53); a caller who is not signed in reads none, because the SELECT policy '
  'names only `authenticated`. The column grants narrow it further: email, '
  'auth_user_id and the one-time-code columns are not selectable by anon or '
  'authenticated at all (20261022163452).';
