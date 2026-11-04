# Handoff: case advance is now a single atomic write

**From:** Agent A (security & data integrity)
**To:** Agent B (journey / UI)
**Date:** 2026-11-04

## What changed

`components/live/case-detail.tsx` — `moveCase()` no longer performs two PostgREST
calls (`updateById("compliance_cases", …)` then `case_events.insert(…)`). It now
calls the `advance_case(case_id, patch jsonb, events jsonb)` SECURITY DEFINER RPC
(added in PR #372), which applies the engine patch and appends the audit events in
**one transaction**. Authority and the stage transition are re-checked by the
existing `case_stage_guard` trigger, so a rejected write can never leave a case
advanced with no audit trail.

## Why Agent A touched `components/**`

This is a data-integrity fix (atomic case write), not a UI change — the write path
was the defect. The error surface maps `not_permitted` / `requires current firm
authority` to the existing `t.notPermitted` string; all other RPC errors map to
`t.moveFailed`.

## What remains for you (and a note for Agent A)

- `settleRequest()` and `createRequest()` still write `document_requests` and
  `case_events` in two calls. They need their own `settle_request` /
  `create_request` RPCs (a follow-up migration), then the same one-call rewiring.
- `toggleTask()` is already atomic (single `case_tasks` write, no event).
- Please keep the `moveFailed`/`notPermitted` UX untouched; no copy changed.
