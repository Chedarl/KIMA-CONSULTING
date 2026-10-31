-- Phase 4 draft only. PostgreSQL enum labels must commit before being used
-- by the following migration's constraints and triggers.
alter type public.case_stage add value if not exists 'client_approval';
alter type public.case_stage add value if not exists 'cancelled';
