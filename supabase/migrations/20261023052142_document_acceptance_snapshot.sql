-- The three verdicts travel with the document.
--
-- Accounting, charge deductibility and VAT recovery are stored together.
-- A negative verdict does not delete the row: the document stays, with the
-- defect stated. Request acceptance remains a separate later act.

alter table public.documents
  add column if not exists acceptance jsonb;

comment on column public.documents.acceptance is
  'Facts read from the document and the three verdicts computed from them. A fail does not remove the row.';
