-- The SECURITY DEFINER policy helpers leave the exposed API schema.
--
-- Eleven definer functions sat in `public`, which is the schema PostgREST
-- publishes, so every one of them was an endpoint at /rest/v1/rpc/<name>. The
-- Supabase security advisor reports seven callable by `anon` and eight by
-- `authenticated` (29 Oct). They exist to be called from inside RLS policies,
-- never by a browser. The advisor offers two remedies: revoke EXECUTE, or move
-- them out of the exposed schema. Only the second one works here, and the first
-- attempt at this migration proved it the hard way.
--
-- WHY NOT REVOKE
-- Postgres checks EXECUTE on a function in an RLS policy expression against the
-- querying role, at execution time. Revoking EXECUTE therefore does not close an
-- endpoint while leaving the policy working: it breaks the policy. An earlier
-- revision of this file revoked from PUBLIC, anon and authenticated, and the
-- controls in supabase/tests/definer_surface_test.sql failed exactly as they
-- were written to:
--
--     permission denied for function client_taxpayer_ids
--     CONTEXT: SQL statement "insert into documents ..."
--
-- raised from inside the policy, not from a direct call. Six of the existing P0
-- write tests went with it. The product would have gone silent for every signed
-- in user.
--
-- This is also why the three `revoke execute ... from anon, authenticated` lines
-- in 20261029213000 did not break anything: those functions were new, so PUBLIC
-- still held the default EXECUTE grant that `anon` and `authenticated` inherit,
-- and naming the two roles removed nothing. They read as a control and are not
-- one. The grants below supersede them and say so out loud.
--
-- WHAT ACTUALLY CLOSES THE ENDPOINT
-- PostgREST introspects the schemas it is configured to expose, `public` among
-- them and `private` not. A function in `private` has no route, whatever its
-- privileges. Moving preserves the function's OID, so the policy expressions
-- that call it keep working untouched: a policy stores the function it resolved
-- at CREATE POLICY time, not the name it was written with.
--
-- THE ONE EXPOSURE THAT STAYS, AND WHY
-- /api/inquiry must know whether the caller may write a client-visible note
-- *before* it sends mail, or a refused write would leave a client emailed with
-- no record of it. can_write_client_note(tp) stays in `public`, granted to
-- `authenticated` only. It answers that one question, about the caller and
-- nobody else, and returns a boolean rather than any row. Plan phase 1 asks for
-- each remaining call to be justified in writing; this is the justification, and
-- T-53 asserts it is the *only* one.

-- ---------------------------------------------------------------------------
-- 1. A schema PostgREST does not publish.
-- ---------------------------------------------------------------------------
create schema if not exists private;

comment on schema private is
  'Helpers called from inside RLS policies and triggers. Not exposed by '
  'PostgREST, so nothing here is an API endpoint. Roles need USAGE and EXECUTE '
  'because a policy expression runs as the querying role; the schema being '
  'unpublished is what keeps it off the API, not the privileges.';

grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Move them.
-- ---------------------------------------------------------------------------

-- Called by name in the USING and WITH CHECK expressions of most tables here.
alter function public.can_see_taxpayer(uuid) set schema private;
alter function public.client_taxpayer_ids() set schema private;
alter function public.member_has(text) set schema private;
alter function public.member_has(text, uuid) set schema private;
alter function public.member_has_in_org(text, uuid) set schema private;
alter function public.firm_member_has(text) set schema private;

-- Reached from inside the four above, and from the two SECURITY INVOKER trigger
-- guards in section 4.
alter function public.current_firm_role() set schema private;
alter function public.current_member_label() set schema private;
alter function public.demo_taxpayer_id() set schema private;
alter function public.flag_enabled(text) set schema private;

-- A trigger function. Triggers resolve by OID, so moving it changes nothing
-- except that it is no longer an endpoint.
alter function public.auth_identity_is_single() set schema private;

-- Superseded by portal_issue_code(), which only the service role may call. This
-- one issues a one-time code: it writes otp_hash and otp_expires_at on a
-- portal_accounts row matched by name and NIU, and `anon` could call it. It
-- discloses nothing, returning only a masked destination, but an
-- unauthenticated caller could invalidate a client's pending code at will and
-- lock the real client out of signing in. No policy, trigger or application
-- code calls it, so unlike the helpers above it can also lose its grants
-- outright. Risk R-49. Dropping it needs owner approval and is proposed
-- separately.
alter function public.portal_request_code(text, text) set schema private;
revoke execute on function private.portal_request_code(text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The grants a policy needs, stated rather than inherited.
--
-- These are the functions a policy expression names directly, so the querying
-- role must be able to execute them. This replaces the three no-op revokes in
-- 20261029213000: EXECUTE is not the boundary here and pretending otherwise
-- cost a CI run. The boundary is section 1.
-- ---------------------------------------------------------------------------
grant execute on function private.can_see_taxpayer(uuid) to anon, authenticated;
grant execute on function private.client_taxpayer_ids() to anon, authenticated;
grant execute on function private.member_has(text) to anon, authenticated;
grant execute on function private.member_has(text, uuid) to anon, authenticated;
grant execute on function private.member_has_in_org(text, uuid) to anon, authenticated;
grant execute on function private.firm_member_has(text) to anon, authenticated;

-- current_member_label() is called by service_payment_review_guard(), a
-- SECURITY INVOKER trigger that fires on a firm member's own write.
grant execute on function private.current_member_label() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Everything that resolves a sibling by bare name.
--
-- Each of these calls a function that is now in `private` while still reading
-- tables in `public`, so both schemas have to be on its search_path. Getting
-- this wrong is a runtime failure, not a migration failure, which is why the
-- controls in the test file exercise all three call paths.
--
-- demo_taxpayer_id() is deliberately absent: its search_path is the empty
-- string and it qualifies public.taxpayers itself, which keeps working.
-- ---------------------------------------------------------------------------
alter function private.can_see_taxpayer(uuid) set search_path to 'private', 'public';
alter function private.member_has(text) set search_path to 'private', 'public';

-- The two SECURITY INVOKER trigger guards. They run as the writing role, so
-- they need the search_path and the grants above.
alter function public.client_request_update_guard() set search_path to 'private', 'public';
alter function public.service_payment_review_guard() set search_path to 'private', 'public';

-- ---------------------------------------------------------------------------
-- 5. The one question the application still has to ask.
--
-- Created after the moves above, because it calls member_has(cap, tp) and that
-- is now in `private`.
-- ---------------------------------------------------------------------------
create or replace function public.can_write_client_note(tp uuid)
returns boolean
language sql
stable
security definer
set search_path to 'private', 'public'
as $$
  select member_has('note.write_client', tp)
$$;

comment on function public.can_write_client_note(uuid) is
  'May the caller write a client-visible note about that taxpayer? Answers '
  'about the caller only and returns a boolean, never a row. The one '
  'SECURITY DEFINER function left in the exposed schema, and the only one '
  'anon or authenticated may execute there (T-53 holds that). Exposed on '
  'purpose: /api/inquiry must know before it sends mail, because a write '
  'refused afterwards would leave a client emailed with no record of it. '
  'Scoped through member_has(cap, taxpayer_id), so it needs an accepted '
  'engagement.';

revoke execute on function public.can_write_client_note(uuid) from public, anon;
grant execute on function public.can_write_client_note(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. app_flags: no policy is the right answer, written down.
--
-- The advisor reports RLS enabled with no policy (INFO). That is deliberate and
-- stays: nothing reads app_flags through the API. Its only reader is
-- flag_enabled(), which is SECURITY DEFINER and now lives in `private`, so it
-- reads the table as its owner. RLS with no policy denies every direct select,
-- which is the intent, and a permissive policy would publish the demo switches
-- to the browser. The grants are revoked too, so the refusal does not rest on
-- RLS alone.
-- ---------------------------------------------------------------------------
revoke all on table public.app_flags from anon, authenticated;

comment on table public.app_flags is
  'Demo and environment switches. No RLS policy on purpose: nothing reads this '
  'table through the API. private.flag_enabled() is SECURITY DEFINER and reads '
  'it as the owner, and anon and authenticated hold neither EXECUTE on that '
  'function nor any grant on this table. A permissive policy here would publish '
  'the switches to the browser. Advisor lint 0008 on this table is expected.';
