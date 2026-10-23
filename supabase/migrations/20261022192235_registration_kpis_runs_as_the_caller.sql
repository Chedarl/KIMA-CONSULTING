-- `registrations` became firm-only in the policy sweep, and this view walked
-- straight around it: a SECURITY DEFINER view runs with the privileges of
-- whoever defined it, so an anonymous caller could still read the counts and
-- averages over rows the policy had just put out of reach. Aggregates, not
-- names -- but a view that defeats the policy under it is a hole whatever it
-- returns, and this is the one ERROR the database linter reports.
--
-- security_invoker makes it run as the caller, so the base table's policy
-- applies. The KPI dashboard is a firm surface, so firm-only is the behaviour
-- it should have had from the start.
alter view registration_kpis set (security_invoker = on);

comment on view registration_kpis is
  'Registration KPIs. security_invoker: the caller''s own policies on `registrations` apply, so this cannot be used to read around them.';
