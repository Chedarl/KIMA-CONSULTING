-- Forward-only performance fix for Supabase auth_rls_initplan advisor.
-- Preserve the original contact owner / linked-taxpayer authorization paths.
-- The scalar SELECT lets PostgreSQL cache auth.uid() once per statement.
alter policy "scoped read" on public.contacts
using (
  auth_user_id = (select auth.uid())
  or exists (
    select 1
      from public.contact_account_links l
     where l.contact_id = contacts.id
       and private.can_see_taxpayer(l.taxpayer_id)
  )
);
