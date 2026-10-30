-- portal_request_code() stops being callable by anyone who is not signed in.
--
-- One statement, on its own, because it is live on production and nothing else
-- in the phase 1 work needs to land first.
--
-- WHAT WAS OPEN
-- public.portal_request_code(p_name, p_identifier) is SECURITY DEFINER, and
-- `public` is the schema PostgREST publishes, so it answered at
-- /rest/v1/rpc/portal_request_code with the anon key — the key that ships in the
-- browser. Given a client's display name and NIU it writes otp_hash and
-- otp_expires_at on their portal_accounts row and resets failed_attempts.
--
-- It discloses nothing: it returns the same shape whether or not the account
-- exists, never returns the code, and masks the destination. The damage is the
-- write. Anyone could overwrite a client's pending one-time code repeatedly, so
-- the code the client was actually sent never works and they cannot sign in. No
-- rate limit stands in front of it. Risk R-49.
--
-- WHY A REVOKE IS SAFE HERE, WHEN IT IS NOT FOR THE OTHER DEFINER HELPERS
-- Postgres checks EXECUTE on a function named in an RLS policy expression
-- against the querying role, so revoking EXECUTE on a policy helper breaks the
-- policy instead of closing an endpoint. That is why the rest of the definer
-- helpers have to move schema rather than lose their grants.
--
-- This function is not one of them. No policy, no trigger and no application
-- code calls it: portal_issue_code() replaced it when the auth-codes Edge
-- Function took over, and that one is already service-role only. So the grant
-- can simply go.
--
-- `from public` matters. The ACL reads `=X/postgres`, which is PUBLIC holding
-- EXECUTE; `anon` and `authenticated` reach the function through that grant, so
-- naming only the two roles would remove nothing at all. `postgres` and
-- `service_role` hold their own explicit grants and are unaffected.
--
-- The function is left in place rather than dropped. Dropping is destructive and
-- needs owner approval; this takes the risk to zero without it.
--
-- The timestamp deliberately sits before 20261029213000 (the isolation
-- migration) so this can ship first without putting the migration history out
-- of order.

revoke execute on function public.portal_request_code(text, text)
  from public, anon, authenticated;

comment on function public.portal_request_code(text, text) is
  'SUPERSEDED by portal_issue_code(), and no longer callable by anon or '
  'authenticated: it issues a one-time code, and as an API endpoint it let '
  'anyone reset a client''s pending code and lock them out (R-49). Nothing '
  'calls it. Kept rather than dropped because dropping needs owner approval.';
