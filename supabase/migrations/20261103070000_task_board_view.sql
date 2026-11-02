-- One read for the tasks board (wireframe 03).
--
-- The board needs a task, the case it belongs to, the obligation and period,
-- the assignee's label and how many days are left. Composing that in the
-- browser means four round trips and a client-side join; security_invoker means
-- the same RLS that protects the tables decides the rows, so the view cannot
-- widen access.

create or replace view public.firm_task_board
with (security_invoker = on)
as
select t.id                      as task_id,
       c.organization_id,
       c.taxpayer_id,
       t.case_id,
       t.title,
       t.state,
       t.is_blocking,
       t.due_on,
       (t.due_on - current_date) as days_to_due,
       t.assignee_member_id,
       m.person_label            as assignee_label,
       c.obligation_code,
       c.period_token,
       c.stage                   as case_stage
  from public.case_tasks t
  join public.compliance_cases c on c.id = t.case_id
  left join public.firm_members m on m.id = t.assignee_member_id;

comment on view public.firm_task_board is
  'Task board read: task, case, obligation, period, assignee and days to due. security_invoker, so the caller''s RLS decides the rows.';

grant select on public.firm_task_board to authenticated;
revoke all on public.firm_task_board from anon;
