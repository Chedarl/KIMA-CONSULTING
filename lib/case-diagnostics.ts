/**
 * The diagnostics, asked about a CASE.
 *
 * `lib/diagnostics.ts` was written when the unit of work was a declaration
 * row. The checks themselves are about the compliance preconditions — is the
 * profile verified, is the tax centre known, are the documents in, is there
 * evidence behind a claim of filing — and those hold just as well for a case.
 * What was missing was a way to ask them about one, so the case screen had no
 * honest source of findings for the review gate.
 *
 * THIS IS AN ADAPTER, NOT A SECOND RULE SET. It maps a case onto the input the
 * existing engine takes and returns what that engine says. The one thing it
 * does not pass through is separation of duties: `NO_REVIEWER` and
 * `SELF_APPROVAL` are dropped, because for a case that decision belongs to
 * `canApproveReview()` in `lib/permissions.ts`, which `advance()` already
 * consumes. Two places deciding who may approve is two places to disagree,
 * and this one would be the stale copy — the declaration version knows nothing
 * about roles, disclosure, or a sole practitioner.
 */

import { obligationLabel, openRequests, type CaseRequest, type ComplianceCase } from "./cases";
import { runDiagnostics, type Finding } from "./diagnostics";

/** Decided by `canApproveReview()`, not here. */
const DEFERRED_TO_PERMISSIONS = ["NO_REVIEWER", "SELF_APPROVAL"];

export type CaseTaxpayer = {
  profile_verified: boolean;
  tax_centre: string | null;
  accounting_framework: string | null;
  tax_regime: string | null;
};

/**
 * The filing dimension expressed in the vocabulary the declaration checks use.
 *
 * `awaiting_verification` is the state the evidence check looks for: we have
 * submitted something and the administration has not acknowledged it. Only
 * `verified` counts as filed, which is why a past-due case that was merely
 * submitted still reports its deadline as passed.
 */
const asDeclarationState = (filing: ComplianceCase["filing_status"]): string => {
  if (filing === "verified") return "filed";
  if (filing === "awaiting_verification") return "awaiting_evidence";
  return "draft";
};

export function caseFindings(input: {
  c: Pick<
    ComplianceCase,
    | "id"
    | "obligation_code"
    | "period_token"
    | "due_on"
    | "due_needs_confirmation"
    | "due_basis"
    | "prepared_by"
    | "filing_status"
    | "filing_evidence_ref"
  >;
  taxpayer: CaseTaxpayer;
  requests: CaseRequest[];
  today?: string;
}): Finding[] {
  const { c, taxpayer, requests } = input;
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  const findings = runDiagnostics({
    declaration: {
      id: c.id,
      // The checks read this to decide whether the missing accounting
      // framework is blocking or advisory, so it has to be the real label.
      label_en: obligationLabel(c.obligation_code, "en"),
      period: c.period_token,
      // A case whose deadline is unknown is not a case that is late. Passing
      // today suppresses the past-due check instead of inventing a date; the
      // unknown deadline gets its own finding below.
      due_on: c.due_on ?? today,
      state: asDeclarationState(c.filing_status),
      prepared_by: c.prepared_by,
      // Deliberately absent. See DEFERRED_TO_PERMISSIONS.
      reviewer: null,
      // Rework is counted per request on a case; there is no case-level tally
      // to double-count it with.
      returned_count: 0,
      evidence_reference: c.filing_evidence_ref,
    },
    taxpayer,
    openRequests: openRequests(requests).length,
    returnedRequests: requests.filter((r) => r.returned_count > 0).length,
    today,
  }).filter((f) => !DEFERRED_TO_PERMISSIONS.includes(f.code));

  // Not a rule about tax — a rule about what we know. A deadline we derived
  // from an unverified rule, or from a prorogation that may be superseded, is
  // not a date to approve work against without a human looking at it.
  if (!c.due_on) {
    findings.push({
      code: "DUE_UNKNOWN",
      severity: "advisory",
      fr: "Aucune échéance au dossier : elle dépend du centre des impôts et doit être établie.",
      en: "No deadline on the file: it follows from the tax centre and has to be established.",
    });
  } else if (c.due_needs_confirmation) {
    findings.push({
      code: "DUE_UNCONFIRMED",
      severity: "advisory",
      fr:
        c.due_basis === "prorogation"
          ? "Échéance issue d'une prorogation : à confirmer auprès du centre avant de s'y fier."
          : "Échéance provisoire : la règle appliquée n'est pas vérifiée.",
      en:
        c.due_basis === "prorogation"
          ? "Deadline comes from a prorogation: confirm it with the centre before relying on it."
          : "Provisional deadline: the rule it came from is not verified.",
    });
  }

  return findings;
}
