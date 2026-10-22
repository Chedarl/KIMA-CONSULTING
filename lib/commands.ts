/**
 * Command layer — the only supported way to mutate a case.
 *
 * Components must not invent stage / filing patches. They call these helpers,
 * which run the pure engines and return the row patch plus the events to append.
 * Persistence stays in the caller (or a future server RPC) so the engines remain
 * free of I/O.
 */

import {
  advance,
  recordFiling,
  type AdvanceInput,
  type ComplianceCase,
  type RecordFilingInput,
} from "./cases";
import {
  eventsFromAdvance,
  eventsFromFiling,
  type Actor as EventActor,
  type NewCaseEvent,
} from "./events";
import {
  APPROVAL_LABELS,
  can,
  canApproveReview,
  type Actor as AuthActor,
  type FirmMember,
} from "./permissions";

export type CommandRefusal = {
  ok: false;
  reason: string;
  reasonFr: string;
  reasonEn: string;
};

const ADVANCE_LABELS: Record<string, { fr: string; en: string }> = {
  not_allowed: {
    fr: "Cette transition n'est pas permise.",
    en: "That transition is not allowed.",
  },
  blocked_by_findings: {
    fr: "Des constats bloquants restent ouverts.",
    en: "Blocking findings remain open.",
  },
  documents_outstanding: {
    fr: "Des pièces demandées ne sont pas encore acceptées.",
    en: "Requested documents are not yet accepted.",
  },
  documents_not_checked: {
    fr: "Les pièces n'ont pas été vérifiées avant cette transition.",
    en: "Documents were not checked before this transition.",
  },
  approval_not_checked: {
    fr: "La décision d'approbation n'a pas été fournie.",
    en: "The approval decision was not supplied.",
  },
  self_approval_refused: {
    fr: "Auto-validation refusée.",
    en: "Self-approval refused.",
  },
  owner_required: {
    fr: "Un responsable est requis.",
    en: "An owner is required.",
  },
  filing_not_verified: {
    fr: "Le dépôt n'est pas encore vérifié.",
    en: "Filing is not yet verified.",
  },
  forbidden: {
    fr: "Ce rôle ne peut pas effectuer cette action.",
    en: "This role cannot perform that action.",
  },
};

export type AdvanceCommandResult =
  | { ok: true; patch: Partial<ComplianceCase>; events: NewCaseEvent[] }
  | CommandRefusal;

export function commandAdvanceCase(input: {
  current: ComplianceCase;
  advance: AdvanceInput;
  eventActor: EventActor;
  authActor: AuthActor;
  requireSecondReview?: boolean;
  discloseSelfApproval?: boolean;
}): AdvanceCommandResult {
  const allowed = can(input.authActor, "case.advance", input.current.taxpayer_id);
  if (!allowed.ok) {
    const labels = ADVANCE_LABELS.forbidden;
    return { ok: false, reason: "forbidden", reasonFr: labels.fr, reasonEn: labels.en };
  }

  let advanceInput = input.advance;
  if (input.advance.to === "filing" && input.authActor.kind === "firm") {
    const decision = canApproveReview(input.current, input.authActor, {
      requireSecondReview: input.requireSecondReview,
      discloseSelfApproval: input.discloseSelfApproval ?? true,
    });
    if (!decision.ok) {
      const labels = APPROVAL_LABELS[decision.reason];
      return {
        ok: false,
        reason: decision.reason,
        reasonFr: labels.fr,
        reasonEn: labels.en,
      };
    }
    advanceInput = {
      ...input.advance,
      approval: decision,
    };
  }

  const result = advance(input.current, advanceInput);
  if (!result.ok) {
    const labels = ADVANCE_LABELS[result.reason] ?? ADVANCE_LABELS.not_allowed;
    return { ok: false, reason: result.reason, reasonFr: labels.fr, reasonEn: labels.en };
  }

  return {
    ok: true,
    patch: result.patch,
    events: eventsFromAdvance(input.current, advanceInput, input.eventActor),
  };
}

export type FilingCommandResult =
  | { ok: true; patch: Partial<ComplianceCase>; events: NewCaseEvent[] }
  | CommandRefusal;

export function commandRecordFiling(input: {
  current: ComplianceCase;
  filing: RecordFilingInput & { reason?: string | null };
  eventActor: EventActor;
  authActor: AuthActor;
}): FilingCommandResult {
  const needVerify = input.filing.to === "verified";
  const cap = needVerify ? "filing.verify" : "filing.record";
  const allowed = can(input.authActor, cap, input.current.taxpayer_id);
  if (!allowed.ok) {
    const labels = ADVANCE_LABELS.forbidden;
    return { ok: false, reason: "forbidden", reasonFr: labels.fr, reasonEn: labels.en };
  }

  const result = recordFiling(input.current, input.filing);
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      reasonFr: "Enregistrement du dépôt refusé.",
      reasonEn: "Filing record refused.",
    };
  }

  return {
    ok: true,
    patch: result.patch,
    events: eventsFromFiling(input.current, input.filing, input.eventActor),
  };
}

export function firmAuthActor(member: FirmMember): AuthActor {
  return { kind: "firm", member };
}
