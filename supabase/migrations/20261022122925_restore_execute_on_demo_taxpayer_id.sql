-- Every RLS policy added this session scopes rows with
-- public.demo_taxpayer_id(), but an earlier hardening migration revoked
-- EXECUTE on that function from anon and authenticated. A policy that cannot
-- evaluate its own predicate fails the request outright, so every read of
-- compliance_cases, contacts, contact_account_links, account_tags,
-- document_verdicts and portal_accounts returned 401.
--
-- The obvious fix was to replace those policies with `using (true)`. That
-- would have worked and it would have been wrong: it drops tenant scoping on
-- six tables to repair one missing grant.
--
-- This restores the grant instead, so the scoped policies work as written.
-- The function takes no arguments, returns a single taxpayer id in a
-- synthetic-data demo project, and is read-only. It is the narrowest change
-- that fixes the fault, and it leaves the policies stricter than the
-- permissive ones the older tables still use.
--
-- Still not the production access model: production needs authenticated users
-- and membership-based scoping per docs/foundation/permissions-matrix.md.
-- Risk R-32 stands.

grant execute on function public.demo_taxpayer_id() to anon, authenticated;

comment on function public.demo_taxpayer_id() is
  'Returns the seeded demo taxpayer id. Called inside RLS policies, so anon and authenticated must retain EXECUTE or those policies fail closed with a 401. Demo scaffolding; replaced by real tenant scoping in production.';
