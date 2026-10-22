/**
 * Compliance cases — the spine of the firm workspace.
 *
 * A case is ONE obligation for ONE taxpayer in ONE period: "VAT for September
 * 2026 for Mboa Trading". Everything the firm does hangs off that unit — the
 * documents it needs, the review it must pass, the evidence it must keep.
 *
 * CASES ARE GENERATED, NOT CONFIGURED. They come from `obligationsFor()` and
 * `resolveDueDate()`, which come from the rule registry. This is the inverse of
 * the reference product, whose pipelines are templates somebody must remember
 * to apply, and whose own users name the configuration burden as the main
 * obstacle. A solo practitioner with ten clients has no operations team to
 * build workflows, and should not need one.
 *
 * THE UNCERTAINTY TRAVELS WITH THE CASE. Most of our rule corpus is `inferred`
 * rather than `verified`, so generating cases could mint confident-looking
 * deadlines out of evidence nobody has checked. A generated case carries
 * `due_needs_confirmation` from the resolver, and the queue renders those dates
 * as provisional. The case inherits the doubt instead of laundering it.
 *
 * TWO VOCABULARIES, KEPT APART. The firm's internal stage is detailed; the
 * client-visible status is a small fixed set. Which draft failed review and who
 * it went back to is not the client's business, and a portal that leaks it
 * invites arguments about work in progress rather than about outcomes.
 *
 * Pure functions, so a stage, a date or a refusal can be explained without
 * running the application.
 */

import {
  OBLIGATIONS,
  obligationsFor,
  resolveDueDate,
  type Obligation,
  type Prorogation,
  type Regime,
  type TaxpayerType,
} from "./rules";
import { periodToken, type Period } from "./document-naming";
import { hasBlocking, type Finding } from "./diagnostics";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export type CaseStage =
  | "documents"
  | "accounting"
  | "preparation"
  | "review"
  | "filing"
  | "evidence"
  | "delivered"
  | "abandoned";

export type ComplianceCase = {
  id: string;
  taxpayer_id: string;
  obligation_code: string;
  period_token: string;
  due_on: string | null;
  due_needs_confirmation: boolean;
  due_basis: "statutory" | "prorogation";
  stage: CaseStage;
  owner: string | null;
  blocker: string | null;
  opened_at: string;
  closed_at: string | null;
};

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/**
 * The real sequence, with the exceptions that actually happen.
 *
 * Work goes backwards more often than forward in this trade: a review that
 * fails returns to preparation, and a document that turns out to be missing
 * sends an accounting case back to collecting. A pipeline modelling only
 * forward motion cannot represent the most frustrating part of the job — the
 * lesson the request lifecycle already learned with its `returned` state.
 */
const STAGE_FLOW: Record<CaseStage, CaseStage[]> = {
  documents: ["accounting", "abandoned"],
  accounting: ["preparation", "documents", "abandoned"],
  preparation: ["review", "accounting", "documents", "abandoned"],
  review: ["filing", "preparation", "abandoned"],
  filing: ["evidence", "review", "abandoned"],
  evidence: ["delivered", "filing", "abandoned"],
  delivered: [],
  abandoned: [],
};

export const canAdvance = (from: CaseStage, to: CaseStage): boolean =>
  STAGE_FLOW[from]?.includes(to) ?? false;

export const nextStages = (from: CaseStage): CaseStage[] => STAGE_FLOW[from] ?? [];

export const isClosed = (s: CaseStage): boolean => s === "delivered" || s === "abandoned";

export const STAGE_LABELS: Record<CaseStage, { fr: string; en: string }> = {
  documents: { fr: "Pièces", en: "Documents" },
  accounting: { fr: "Comptabilité", en: "Accounting" },
  preparation: { fr: "Préparation", en: "Preparation" },
  review: { fr: "Revue", en: "Review" },
  filing: { fr: "Dépôt", en: "Filing" },
  evidence: { fr: "Preuve de dépôt", en: "Filing evidence" },
  delivered: { fr: "Livré", en: "Delivered" },
  abandoned: { fr: "Abandonné", en: "Abandoned" },
};

export const stageLabel = (s: CaseStage, locale: "fr" | "en") =>
  locale === "fr" ? STAGE_LABELS[s].fr : STAGE_LABELS[s].en;

// ---------------------------------------------------------------------------
// What the client sees
// ---------------------------------------------------------------------------

/**
 * Five states, and no more.
 *
 * The client needs to know whether the ball is in their court, whether we are
 * working, and whether it is finished. They do not need our stage names, and
 * showing them turns "why is it in preparation and not review?" into a
 * conversation nobody benefits from.
 */
export type ClientStatus =
  | "waiting_on_you"
  | "in_progress"
  | "in_review"
  | "filed_awaiting_proof"
  | "complete";

export const CLIENT_STATUS_LABELS: Record<ClientStatus, { fr: string; en: string }> = {
  waiting_on_you: { fr: "Nous attendons vos pièces", en: "We are waiting for your documents" },
  in_progress: { fr: "Travail en cours", en: "Work in progress" },
  in_review: { fr: "En cours de revue", en: "Under review" },
  filed_awaiting_proof: { fr: "Déposé — preuve en attente", en: "Filed — awaiting proof" },
  complete: { fr: "Terminé", en: "Complete" },
};

/**
 * The one place the internal stage is translated for the client.
 *
 * `documents` reads as "waiting on you" ONLY when a blocker is actually
 * recorded. A case sitting in documents because the firm has not started is
 * not the client's fault and must not be shown as though it were — that is how
 * a portal quietly blames the customer for the firm's own backlog.
 */
export function clientStatus(c: Pick<ComplianceCase, "stage" | "blocker">): ClientStatus {
  switch (c.stage) {
    case "documents":
      return c.blocker ? "waiting_on_you" : "in_progress";
    case "accounting":
    case "preparation":
      return "in_progress";
    case "review":
      return "in_review";
    case "filing":
    case "evidence":
      return "filed_awaiting_proof";
    case "delivered":
    case "abandoned":
      return "complete";
  }
}

export const clientStatusLabel = (s: ClientStatus, locale: "fr" | "en") =>
  locale === "fr" ? CLIENT_STATUS_LABELS[s].fr : CLIENT_STATUS_LABELS[s].en;

// ---------------------------------------------------------------------------
// Advancing a case
// ---------------------------------------------------------------------------

export type AdvanceInput = {
  to: CaseStage;
  by: string;
  blocker?: string | null;
  findings?: Finding[];
  at?: string;
};

export type AdvanceResult =
  | { ok: true; patch: Partial<ComplianceCase> }
  | { ok: false; reason: "not_allowed" | "blocked_by_findings" | "owner_required" };

/**
 * Move a case, or refuse and say why.
 *
 * THE GATE: review → filing is refused while a blocking diagnostic is open.
 * That rule already exists in `lib/diagnostics.ts`, where it gates approval;
 * this is the same gate expressed as movement, so the two cannot disagree. It
 * is the one transition where being wrong is expensive — everything before it
 * is internal, and everything after it has left the building.
 */
export function advance(
  current: Pick<ComplianceCase, "stage" | "owner">,
  input: AdvanceInput,
): AdvanceResult {
  if (!canAdvance(current.stage, input.to)) return { ok: false, reason: "not_allowed" };

  if (current.stage === "review" && input.to === "filing") {
    if (hasBlocking(input.findings ?? [])) return { ok: false, reason: "blocked_by_findings" };
  }

  // Work that nobody owns is work that does not happen.
  if (input.to !== "abandoned" && !current.owner && !input.by.trim()) {
    return { ok: false, reason: "owner_required" };
  }

  const at = input.at ?? new Date().toISOString();
  const patch: Partial<ComplianceCase> = { stage: input.to };

  if (!current.owner) patch.owner = input.by.trim();
  // Moving a case asserts that the previous blocker is gone. Carrying it
  // forward silently is how a queue fills with stale reasons.
  patch.blocker = input.blocker?.trim() || null;

  if (isClosed(input.to)) patch.closed_at = at;

  return { ok: true, patch };
}

// ---------------------------------------------------------------------------
// Generating cases from the rules
// ---------------------------------------------------------------------------

export type ProposedCase = {
  obligation_code: string;
  period_token: string;
  due_on: string;
  due_needs_confirmation: boolean;
  due_basis: "statutory" | "prorogation";
  /** Why this case exists, in the practitioner's language. */
  reasonFr: string;
  reasonEn: string;
};

const periodsForCadence = (o: Obligation, year: number): Period[] => {
  if (o.cadence === "monthly") {
    return Array.from({ length: 12 }, (_, i) => ({ kind: "month" as const, year, month: i + 1 }));
  }
  if (o.cadence === "quarterly") {
    return [1, 2, 3, 4].map((quarter) => ({ kind: "quarter" as const, year, quarter }));
  }
  return [{ kind: "year" as const, year }];
};

/**
 * The cases a taxpayer's year implies.
 *
 * PROPOSED, never silently inserted. A human opens them. The rule corpus is
 * mostly unverified, and a system that quietly created a year of deadlines from
 * inferred rules would be asserting far more than it knows.
 */
export function proposeCases(input: {
  type: TaxpayerType;
  regime: Regime | null;
  year: number;
  prorogations?: Prorogation[];
}): ProposedCase[] {
  const out: ProposedCase[] = [];

  for (const o of obligationsFor({ type: input.type, regime: input.regime })) {
    for (const period of periodsForCadence(o, input.year)) {
      const resolved = resolveDueDate(
        o,
        {
          year: input.year,
          month: period.kind === "month" ? period.month : undefined,
          quarter: period.kind === "quarter" ? period.quarter : undefined,
        },
        input.prorogations ?? [],
      );

      // A cadence that cannot place this period yields no date. Inventing one
      // would be worse than omitting the case.
      if (!resolved.date) continue;

      out.push({
        obligation_code: o.code,
        period_token: periodToken(period),
        due_on: resolved.date,
        due_needs_confirmation: resolved.needsConfirmation,
        due_basis: resolved.basis,
        reasonFr: `${o.fr} — ${resolved.reasonFr}`,
        reasonEn: `${o.en} — ${resolved.reasonEn}`,
      });
    }
  }

  return out.sort((a, b) => a.due_on.localeCompare(b.due_on));
}

export const obligationLabel = (code: string, locale: "fr" | "en") => {
  const o = OBLIGATIONS.find((x) => x.code === code);
  return o ? (locale === "fr" ? o.fr : o.en) : code;
};

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export type Risk = "overdue" | "due_soon" | "on_track" | "unknown";

/**
 * How worried to be about a case.
 *
 * `unknown` is a real answer, not a gap: a case whose due date rests on an
 * unverified rule has no reliable deadline, and colouring it green or red would
 * be inventing confidence we do not have. An overdue date still counts as
 * overdue even when unconfirmed — if the date is wrong it is likely wrong in
 * both directions, and the cheaper error is to look.
 */
export function risk(
  c: Pick<ComplianceCase, "due_on" | "due_needs_confirmation" | "stage" | "closed_at">,
  today = new Date().toISOString().slice(0, 10),
  soonDays = 7,
): Risk {
  if (c.closed_at || isClosed(c.stage)) return "on_track";
  if (!c.due_on) return "unknown";
  if (c.due_on < today) return "overdue";
  if (c.due_needs_confirmation) return "unknown";
  const days = Math.round(
    (Date.parse(`${c.due_on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  return days <= soonDays ? "due_soon" : "on_track";
}

/**
 * The queue order: what a practitioner should look at first.
 *
 * Overdue, then imminent, then everything whose date we cannot vouch for —
 * because an unconfirmed deadline is a task in itself, not something to let
 * drift to the bottom of a list.
 */
const RISK_ORDER: Record<Risk, number> = { overdue: 0, due_soon: 1, unknown: 2, on_track: 3 };

export function queueOrder<T extends Parameters<typeof risk>[0]>(cases: T[], today?: string): T[] {
  return [...cases].sort((a, b) => {
    const ra = RISK_ORDER[risk(a, today)];
    const rb = RISK_ORDER[risk(b, today)];
    if (ra !== rb) return ra - rb;
    return (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31");
  });
}

/** Open cases with nobody's name on them. Work nobody owns does not happen. */
export const unowned = <T extends Pick<ComplianceCase, "owner" | "stage" | "closed_at">>(
  cases: T[],
): T[] => cases.filter((c) => !c.closed_at && !isClosed(c.stage) && !c.owner);
