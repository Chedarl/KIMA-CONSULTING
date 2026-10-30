-- The SECURITY DEFINER helpers stop being API endpoints.
--
-- Every function below runs as its owner and is reachable over PostgREST at
-- /rest/v1/rpc/<name>. The Supabase security advisor reports seven callable by
-- `anon` and eight by `authenticated` (29 Oct). They exist to be called from
-- inside RLS policies, never by a browser.
--
-- WHY `from public` AND NOT ONLY `from anon, authenticated`
-- Their ACLs read `=X/postgres`, which is PUBLIC holding EXECUTE. `anon` and
-- `authenticated` reach them through that grant, so revoking from the two roles
-- by name leaves the function exactly as callable as before. Revoking from
-- PUBLIC is what closes the endpoint; `postgres` and `service_role` hold their
-- own explicit grants and keep working.
--
-- WHY THE POLICIES STILL WORK
-- A policy expression is parsed when the policy is created, by the table owner,
-- and EXECUTE on a function is checked at parse time rather than on every
-- execution. So a policy keeps calling a helper the querying role may not call
-- itself. That is a claim worth distrusting, which is why
-- supabase/tests/definer_surface_test.sql asserts both halves on every build:
-- the direct call is refused (T-51 to T-54, T-60) and the same read through the
-- policy still returns the right rows for a firm member, for a client and for
-- the anonymous demo (T-55 to T-58). If the claim is ever wrong, those controls
-- go red rather than production going quiet.
--
-- THE ONE EXPOSURE THAT STAYS, AND WHY
-- /api/inquiry must know whether the caller may write a client-visible note
-- *before* it sends mail, or a refused write would leave a client emailed with
-- no record of it. can_write_client_note(tp) below answers exactly that one
-- question, about the caller and nobody else, and returns a boolean rather than
-- any row. It is granted to `authenticated` only. Plan phase 1 asks for each
-- remaining call to be justified in writing; this is the justification.

-- ---------------------------------------------------------------------------
-- 1. Close the endpoints.
-- ---------------------------------------------------------------------------

-- A trigger function. Nothing should ever call it directly.
revoke execute on function public.auth_identity_is_single()
  from public, anon, authenticated;

-- Policy helpers. Called by name in the USING and WITH CHECK expressions of
-- most tables in this schema.
revoke execute on function public.can_see_taxpayer(uuid)
  from public, anon, authenticated;
revoke execute on function public.client_taxpayer_ids()
  from public, anon, authenticated;
revoke execute on function public.member_has(text)
  from public, anon, authenticated;

-- Reached only from inside can_see_taxpayer() and member_has(), which run as
-- their owner, so the nested calls are checked against that owner and are
-- unaffected by this.
revoke execute on function public.current_firm_role()
  from public, anon, authenticated;
revoke execute on function public.current_member_label()
  from public, anon, authenticated;
revoke execute on function public.demo_taxpayer_id()
  from public, anon, authenticated;

-- Superseded by portal_issue_code(), which only the service role may call. This
-- one issues a one-time code and was reachable by `anon`: an unauthenticated
-- caller could reset a client's OTP at will, and no application code has called
-- it since the Edge Function took over.
revoke execute on function public.portal_request_code(text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. app_flags: no policy is the right answer, written down.
--
-- The advisor reports RLS enabled with no policy (INFO). That is deliberate and
-- stays: nothing reads app_flags through the API. The only reader is
-- flag_enabled(), a SECURITY DEFINER function that `anon` and `authenticated`
-- already cannot execute, so it reads the table as its owner. RLS with no
-- policy denies every direct select, which is the intent, and adding a
-- permissive policy would publish the demo switches to the browser.
-- The grants are revoked as well, so the refusal does not depend on RLS alone.
-- ---------------------------------------------------------------------------
revoke all on table public.app_flags from anon, authenticated;

comment on table public.app_flags is
  'Demo and environment switches. No RLS policy on purpose: nothing reads this '
  'table through the API. flag_enabled() is SECURITY DEFINER and reads it as '
  'the owner, and anon and authenticated hold neither EXECUTE on that function '
  'nor any grant on this table. A permissive policy here would publish the '
  'switches to the browser. Advisor lint 0008 on this table is expected.';

-- ---------------------------------------------------------------------------
-- 3. The one question the application still has to ask.
-- ---------------------------------------------------------------------------
create or replace function public.can_write_client_note(tp uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select member_has('note.write_client', tp)
$$;

comment on function public.can_write_client_note(uuid) is
  'May the caller write a client-visible note about that taxpayer? Answers '
  'about the caller only and returns a boolean, never a row. Exposed to '
  'authenticated on purpose: /api/inquiry must know before it sends mail, '
  'because a refused write would leave a client emailed with no record. Scoped '
  'through member_has(cap, taxpayer_id), so it requires an accepted engagement.';

revoke execute on function public.can_write_client_note(uuid) from public, anon;
grant execute on function public.can_write_client_note(uuid) to authenticated;
