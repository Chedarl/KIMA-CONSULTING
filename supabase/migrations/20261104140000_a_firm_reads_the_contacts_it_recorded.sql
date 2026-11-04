-- A firm reads, and can correct, the contacts it recorded.
--
-- WHAT WAS BROKEN
-- public.contacts carried exactly two policies: "firm writes contacts"
-- (insert, scoped to private.member_has_in_org('case.advance',
-- organization_id)) and "scoped read" (select), which was
--
--   auth_user_id = auth.uid()
--   or exists (select 1 from contact_account_links l
--              where l.contact_id = contacts.id
--                and can_see_taxpayer(l.taxpayer_id))
--
-- A firm could therefore insert a contact into its own organisation and never
-- read it back. The row became visible only through a contact_account_links
-- row pointing at a taxpayer the caller could already see, so a contact
-- recorded before any taxpayer exists -- which is every CRM intake: a
-- prospect, a lead's finance manager, the person who answered the phone --
-- was write-only. It went in and disappeared.
--
-- This is the mechanical reason the 4 November field report found "CRM is
-- missing on every side" (docs/audits/2026-11-04-field-issues.md section 4)
-- while the tables existed and were populated. A contacts list cannot be built
-- on rows the policy hides from the firm that owns them.
--
-- engagements received the organisation's own view when firm access was scoped
-- to the engaged organisation (20261029213000); tags received it in
-- 20261104121000. contacts was missed by both passes.
--
-- There were also no update and no delete policies at all, so a firm could not
-- fix a misspelt name -- only insert another row it equally could not read.
--
-- WHY THIS IS NOT A WIDENING OF TENANT ACCESS
-- contacts.organization_id is the firm that recorded the person; the insert
-- policy is what puts it there. private.member_has_in_org() resolves through
-- firm_members, returns false for a caller outside the organisation, and
-- returns false for a suspended firm. The new clause therefore adds exactly
-- one thing: a firm reads its own rows. It grants nothing across firms, and
-- anon still matches no clause.
--
-- THE DELIBERATE CONSEQUENCE, STATED PLAINLY
-- A firm keeps reading a contact it recorded after an engagement is revoked.
-- The person's link to the tax file does not come with it:
-- contact_account_links stays scoped by can_see_taxpayer(), so the firm sees
-- "a person we recorded" and not "this person is attached to that taxpayer".
-- A firm's own address book is the firm's; the taxpayer relationship is not.
--
-- Reads stay on 'case.view' and writes on 'case.advance', matching tags.

drop policy if exists "scoped read" on public.contacts;

create policy "scoped read" on public.contacts for select
  using (
    auth_user_id = auth.uid()
    or exists (
      select 1 from public.contact_account_links l
      where l.contact_id = contacts.id
        and private.can_see_taxpayer(l.taxpayer_id)
    )
    or private.member_has_in_org('case.view', organization_id)
  );

-- The role set is left as it was, deliberately: the original policy applied to
-- every role and anon satisfies none of the three clauses (auth.uid() is null,
-- can_see_taxpayer() is false, member_has_in_org() is false). Narrowing it to
-- `authenticated` here would be a second, unrelated change to the same policy;
-- the accompanying test pins anon at zero rows so the door stays shut.

create policy "firm updates contacts" on public.contacts for update to authenticated
  using (private.member_has_in_org('case.advance', organization_id))
  with check (private.member_has_in_org('case.advance', organization_id));

create policy "firm deletes contacts" on public.contacts for delete to authenticated
  using (private.member_has_in_org('case.advance', organization_id));

comment on policy "scoped read" on public.contacts is
  'A person is visible to themselves, through a tax file the caller may see, or '
  'to an active member of the firm that recorded them. The last clause is what '
  'makes an unlinked CRM contact readable by its own firm.';
