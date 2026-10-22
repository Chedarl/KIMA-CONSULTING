-- The read policy on firm_members is `using (true)` for a good reason: the
-- client portal names the professional responsible for a file, and who works at
-- the firm is not a secret from the firm's own clients.
--
-- Their EMAIL ADDRESSES are a different matter. RLS is row-level, so the policy
-- cannot say "every row, but not that column" -- column privileges can.
revoke select (email) on firm_members from anon, authenticated;

comment on column firm_members.email is
  'Not readable by anon or authenticated: the row is public to clients so they can see who handles their file, but staff contact details are not.';
