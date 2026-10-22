-- A disclosed self-approval is a fact about how the work was checked, and the
-- person whose return it is has the clearest interest in knowing it. So it is a
-- client-visible event rather than a column nobody reads.
--
-- Adding a kind requires a migration by design: the vocabulary is closed, so
-- the engine and the database cannot drift into describing the same change in
-- two different words.

alter table case_events drop constraint event_kind_known;
alter table case_events add constraint event_kind_known check (kind in (
  'case_opened', 'stage_advanced', 'stage_returned', 'advance_refused',
  'owner_assigned', 'client_status_changed', 'case_closed', 'case_abandoned',
  'self_approval_disclosed',
  'filing_attempted', 'filing_awaiting_verification', 'filing_verified',
  'filing_correction_required', 'filing_reset',
  'payment_evidence_requested', 'payment_evidence_received', 'payment_verified',
  'quotation_sent', 'quotation_accepted', 'invoice_issued', 'fee_paid', 'fee_outstanding',
  'document_uploaded', 'document_accepted', 'document_rejected',
  'request_created', 'request_attached', 'request_submitted',
  'request_returned', 'request_accepted',
  'engagement_authorized', 'engagement_accepted', 'engagement_revoked',
  'note_added'
));

alter table case_events drop constraint event_visibility_allowed;
alter table case_events add constraint event_visibility_allowed check (
  visibility = 'internal' or kind in (
    'case_opened', 'client_status_changed', 'case_closed', 'case_abandoned',
    'self_approval_disclosed',
    'filing_attempted', 'filing_verified', 'filing_correction_required',
    'payment_evidence_requested', 'payment_verified',
    'document_uploaded',
    'request_created', 'request_submitted', 'request_returned', 'request_accepted',
    'engagement_authorized', 'engagement_accepted', 'engagement_revoked',
    'note_added'
  )
);
