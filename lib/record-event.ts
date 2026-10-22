/**
 * Persist a case_events row. Prefer this over `activity_events`.
 *
 * After the auth-closeout migration, `case_id` may be null when `taxpayer_id`
 * is set, so taxpayer-level notes no longer need a parallel free-text log.
 */

import { buildEvent, type Actor, type EventKind } from "./events";
import { supabase } from "./supabase";

export async function recordCaseEvent(input: {
  caseId?: string | null;
  taxpayerId: string;
  organizationId?: string | null;
  actor: Actor;
  kind: EventKind;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  reason?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const caseId = input.caseId ?? null;
  // buildEvent requires a case id string; we overwrite with null for taxpayer-level rows.
  const draft = buildEvent(caseId ?? "00000000-0000-0000-0000-000000000000", input.actor, {
    kind: input.kind,
    from: input.from ?? null,
    to: input.to ?? null,
    subject: input.subject ?? null,
    reason: input.reason ?? null,
  });

  const { error } = await supabase()
    .from("case_events")
    .insert({
      organization_id: input.organizationId ?? null,
      case_id: caseId,
      taxpayer_id: input.taxpayerId,
      occurred_at: draft.occurred_at,
      dimension: draft.dimension,
      kind: draft.kind,
      actor_role: draft.actor_role,
      actor_label: draft.actor_label,
      from_value: draft.from_value,
      to_value: draft.to_value,
      subject_ref: draft.subject_ref,
      reason: draft.reason,
      visibility: draft.visibility,
    });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
