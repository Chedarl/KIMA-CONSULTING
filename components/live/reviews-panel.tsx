"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { audit, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { updateById } from "@/lib/db-write";
import { caseFindings } from "@/lib/case-diagnostics";
import {
  filingLabel,
  nextFilingStatus,
  obligationLabel,
  openRequests,
  stageLabel,
  type CaseRequest,
  type ComplianceCase,
  type FilingStatus,
} from "@/lib/cases";
import { commandAdvanceCase, commandRecordFiling } from "@/lib/commands";
import type { NewCaseEvent } from "@/lib/events";
import {
  memberFromSession,
  subscribeFirmSession,
  type FirmSession,
} from "@/lib/firm-auth";
import {
  approvalLabel,
  can,
  canApproveReview,
  denialLabel,
  requiresSecondReview,
  type Actor,
  type FirmMember,
} from "@/lib/permissions";
import { hasBlocking as findingsBlock } from "@/lib/diagnostics";

/**
 * Review queue for compliance cases.
 *
 * Approval is `commandAdvanceCase` to `filing`, which runs `canApproveReview`.
 * Filing evidence is `commandRecordFiling` for the single next legal status.
 * A case is never marked verified because somebody clicked Approve.
 * Without a firm session the write is refused — this screen does not impersonate.
 */
export type ReviewLabels = {
  blocking: string;
  advisory: string;
  clean: string;
  approve: string;
  approveBlocked: string;
  approved: string;
  recordEvidence: string;
  evidencePlaceholder: string;
  filed: string;
  evidenceRequired: string;
  preparedBy: string;
  reviewer: string;
  none: string;
  failed: string;
  signInRequired: string;
  recordAttempt: string;
  markAwaiting: string;
  notPermitted: string;
  discloseSelf: string;
  stepRecorded: string;
  selfApproved: string;
  queue: string;
  openFile: string;
  due: string;
  statusMet: string;
  statusOpen: string;
  statusWait: string;
  documentsTitle: string;
  documentsMet: string;
  documentsOpen: string;
  diagnosticsTitle: string;
  diagnosticsMet: string;
  preparerTitle: string;
  preparerMissing: string;
  separationTitle: string;
  separationMet: string;
  separationLater: string;
  filingTitle: string;
  filingMet: string;
  filingWait: string;
  empty: string;
  offline: string;
};

type CheckTone = "met" | "open" | "wait";

type CheckRow = {
  id: string;
  title: string;
  detail: string;
  tone: CheckTone;
};

type Taxpayer = {
  id: string;
  legal_name: string;
  profile_verified: boolean | null;
  tax_centre: string | null;
  accounting_framework: string | null;
  tax_regime: string | null;
};

const CASE_COLUMNS =
  "id, taxpayer_id, engagement_id, obligation_code, period_token, due_on, due_needs_confirmation, due_basis, stage, owner, blocker, opened_at, closed_at, filing_status, filing_reference, filing_evidence_ref, filing_attempted_at, filing_verified_at, payment_evidence_status, billing_status, prepared_by, prepared_at, approved_by, approved_at, self_approved";

const REQUEST_COLUMNS =
  "id, case_id, taxpayer_id, label_fr, label_en, status, responsible, due_on, returned_count";

const btn =
  "inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle";

function samePerson(a: string | null, b: string | null): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function statusWord(tone: CheckTone, labels: ReviewLabels): string {
  if (tone === "met") return labels.statusMet;
  if (tone === "open") return labels.statusOpen;
  return labels.statusWait;
}

function StatusMark({ tone, word }: { tone: CheckTone; word: string }) {
  const color =
    tone === "met" ? "text-success-text" : tone === "open" ? "text-danger-text" : "text-amber-text";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold ${color}`}>
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        {tone === "met" ? (
          <path
            d="M3.5 8.2 6.4 11.1 12.5 4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        )}
      </svg>
      {word}
    </span>
  );
}

function filingButton(to: FilingStatus, labels: ReviewLabels): string {
  if (to === "attempted") return labels.recordAttempt;
  if (to === "awaiting_verification") return labels.markAwaiting;
  return labels.recordEvidence;
}

export function ReviewsPanel({ locale, labels }: { locale: "fr" | "en"; labels: ReviewLabels }) {
  const toast = useToast();
  const [cases, setCases] = useState<ComplianceCase[] | null>(null);
  const [taxpayers, setTaxpayers] = useState<Record<string, Taxpayer>>({});
  const [requests, setRequests] = useState<Record<string, CaseRequest[]>>({});
  const [members, setMembers] = useState<FirmMember[]>([]);
  const [assignments, setAssignments] = useState<
    { taxpayer_id: string; assigned_to: string | null }[]
  >([]);
  const [session, setSession] = useState<FirmSession | null>(null);
  const [disclose, setDisclose] = useState<Record<string, boolean>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [{ data: rows, error: caseError }, { data: tp }, { data: reqs }, { data: mem }, { data: eng }] =
        await Promise.all([
          db.from("compliance_cases").select(CASE_COLUMNS).is("closed_at", null).order("due_on"),
          db
            .from("taxpayers")
            .select("id, legal_name, profile_verified, tax_centre, accounting_framework, tax_regime"),
          db.from("document_requests").select(REQUEST_COLUMNS),
          db.from("firm_members").select("id, person_label, role, active, deactivated_at"),
          db.from("engagements").select("taxpayer_id, assigned_to"),
        ]);
      if (caseError) throw caseError;

      const byTaxpayer: Record<string, Taxpayer> = {};
      for (const row of (tp ?? []) as Taxpayer[]) byTaxpayer[row.id] = row;

      const byCase: Record<string, CaseRequest[]> = {};
      for (const row of (reqs ?? []) as CaseRequest[]) {
        if (!row.case_id) continue;
        const list = byCase[row.case_id] ?? [];
        byCase[row.case_id] = [...list, row];
      }

      const roster = ((mem ?? []) as Omit<FirmMember, "email">[]).map((m) => ({
        ...m,
        email: null,
      }));

      setTaxpayers(byTaxpayer);
      setRequests(byCase);
      setMembers(roster);
      setAssignments((eng ?? []) as { taxpayer_id: string; assigned_to: string | null }[]);
      setCases((rows ?? []) as unknown as ComplianceCase[]);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeFirmSession(setSession), []);

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
    try {
      const db = supabase();
      channel = db
        .channel("reviews-queue")
        .on("postgres_changes", { event: "*", schema: "public", table: "compliance_cases" }, () =>
          void load(),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "document_requests" }, () =>
          void load(),
        )
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      if (channel) void channel.unsubscribe();
    };
  }, [load]);

  const member = useMemo(() => {
    if (!session) return null;
    const row = members.find((m) => m.id === session.memberId);
    if (row) return row.active ? row : null;
    return memberFromSession(session);
  }, [session, members]);

  const actor = useMemo<Actor | null>(() => {
    if (!member) return null;
    return {
      kind: "firm",
      member,
      assignedTaxpayerIds: assignments
        .filter((e) => e.assigned_to && e.assigned_to === member.person_label)
        .map((e) => e.taxpayer_id),
    };
  }, [member, assignments]);

  const secondReview = useMemo(() => requiresSecondReview(members), [members]);

  async function persist(
    id: string,
    patch: Record<string, unknown>,
    events: NewCaseEvent[],
  ): Promise<"ok" | "denied" | "failed"> {
    const written = await updateById("compliance_cases", id, patch);
    if (!written.ok) return written.reason === "not_permitted" ? "denied" : "failed";
    if (events.length > 0) {
      const { error: logError } = await supabase().from("case_events").insert(events);
      if (logError) return "failed";
    }
    return "ok";
  }

  async function approve(row: ComplianceCase, caseRequests: CaseRequest[]) {
    if (!member || !actor) {
      toast(labels.signInRequired, "error");
      return;
    }
    const tp = taxpayers[row.taxpayer_id];
    if (!tp) return;
    const findings = caseFindings({
      c: row,
      taxpayer: { ...tp, profile_verified: Boolean(tp.profile_verified) },
      requests: caseRequests,
    });
    const result = commandAdvanceCase({
      current: row,
      advance: {
        to: "filing",
        by: member.person_label,
        findings,
        requests: caseRequests,
      },
      eventActor: { role: member.role, label: member.person_label },
      authActor: actor,
      requireSecondReview: secondReview,
      discloseSelfApproval: disclose[row.id] === true,
    });
    if (!result.ok) {
      toast(locale === "fr" ? result.reasonFr : result.reasonEn, "error");
      return;
    }
    setBusy(row.id);
    try {
      const outcome = await persist(row.id, result.patch as Record<string, unknown>, result.events);
      if (outcome !== "ok") {
        toast(outcome === "denied" ? labels.notPermitted : labels.failed, "error");
        await load();
        return;
      }
      await audit({
        taxpayerId: row.taxpayer_id,
        actor: "firm",
        action: "case.review_approved",
        resourceType: "compliance_case",
        resourceId: row.id,
        before: { stage: row.stage },
        after: { stage: "filing" },
      });
      toast(labels.approved);
      await load();
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(null);
    }
  }

  async function recordStep(row: ComplianceCase, to: FilingStatus) {
    if (!member || !actor) {
      toast(labels.signInRequired, "error");
      return;
    }
    const ref = (evidence[row.id] ?? "").trim();
    if (to === "verified" && !ref) {
      toast(labels.evidenceRequired, "error");
      return;
    }
    const result = commandRecordFiling({
      current: row,
      filing: {
        to,
        evidenceRef: to === "verified" ? ref : null,
        reference: to === "verified" ? ref : null,
      },
      eventActor: { role: member.role, label: member.person_label },
      authActor: actor,
    });
    if (!result.ok) {
      toast(locale === "fr" ? result.reasonFr : result.reasonEn, "error");
      return;
    }
    setBusy(row.id);
    try {
      const outcome = await persist(row.id, result.patch as Record<string, unknown>, result.events);
      if (outcome !== "ok") {
        toast(outcome === "denied" ? labels.notPermitted : labels.failed, "error");
        await load();
        return;
      }
      await audit({
        taxpayerId: row.taxpayer_id,
        actor: "firm",
        action: "case.filing_recorded",
        resourceType: "compliance_case",
        resourceId: row.id,
        before: { filing_status: row.filing_status },
        after: { filing_status: to, filing_evidence_ref: to === "verified" ? ref : null },
      });
      toast(to === "verified" ? labels.filed : labels.stepRecorded);
      setEvidence((prev) => ({ ...prev, [row.id]: "" }));
      await load();
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <p className="rounded-card border border-dashed border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
        {labels.offline}
      </p>
    );
  }
  if (cases === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton h-40 rounded-card" />
        ))}
      </div>
    );
  }

  const pending = cases
    .filter(
      (c) =>
        c.stage === "review" || (c.stage === "filing" && c.filing_status !== "verified"),
    )
    .slice()
    .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"));

  if (pending.length === 0) {
    return (
      <p className="rounded-card border border-success-text/30 bg-success-soft px-4 py-3 text-sm text-success-text">
        {labels.empty}
      </p>
    );
  }

  const selected = pending.find((c) => c.id === selectedId) ?? pending[0];
  const tp = taxpayers[selected.taxpayer_id];
  if (!tp) {
    return (
      <p className="rounded-card border border-success-text/30 bg-success-soft px-4 py-3 text-sm text-success-text">
        {labels.empty}
      </p>
    );
  }

  const caseRequests = requests[selected.id] ?? [];
  const findings = caseFindings({
    c: selected,
    taxpayer: { ...tp, profile_verified: Boolean(tp.profile_verified) },
    requests: caseRequests,
  });
  const blocked = findingsBlock(findings);
  const blockingList = findings.filter((f) => f.severity === "blocking");
  const advisoryList = findings.filter((f) => f.severity === "advisory");
  const approval =
    actor && selected.stage === "review"
      ? canApproveReview(selected, actor, {
          requireSecondReview: secondReview,
          discloseSelfApproval: disclose[selected.id] === true,
        })
      : null;
  const next = selected.stage === "filing" ? nextFilingStatus(selected.filing_status) : null;
  const filingCap = next === "verified" ? "filing.verify" : "filing.record";
  const filingAllowed = actor && next ? can(actor, filingCap, selected.taxpayer_id) : null;
  const gate =
    !actor
      ? labels.signInRequired
      : approval && !approval.ok
        ? approvalLabel(approval.reason, locale)
        : filingAllowed && !filingAllowed.ok
          ? denialLabel(filingAllowed.reason, locale)
          : null;
  const showDisclose =
    selected.stage === "review" &&
    !!member &&
    samePerson(selected.prepared_by, member.person_label) &&
    !secondReview;
  const outstanding = openRequests(caseRequests).length;
  const checks: CheckRow[] = [
    {
      id: "documents",
      title: labels.documentsTitle,
      detail:
        outstanding === 0
          ? labels.documentsMet
          : `${outstanding} — ${labels.documentsOpen}`,
      tone: outstanding === 0 ? "met" : "open",
    },
    {
      id: "diagnostics",
      title: labels.diagnosticsTitle,
      detail:
        blockingList.length === 0
          ? labels.diagnosticsMet
          : blockingList.map((f) => (locale === "fr" ? f.fr : f.en)).join(" "),
      tone: blockingList.length === 0 ? "met" : "open",
    },
    {
      id: "preparer",
      title: labels.preparerTitle,
      detail: selected.prepared_by
        ? `${labels.preparedBy} ${selected.prepared_by}`
        : labels.preparerMissing,
      tone: selected.prepared_by ? "met" : "open",
    },
    {
      id: "separation",
      title: labels.separationTitle,
      detail:
        selected.stage !== "review"
          ? `${labels.separationLater} ${labels.reviewer} ${selected.approved_by ?? labels.none}`
          : !actor
            ? labels.signInRequired
            : approval && !approval.ok
              ? approvalLabel(approval.reason, locale)
              : labels.separationMet,
      tone:
        selected.stage !== "review"
          ? selected.approved_by
            ? "met"
            : "wait"
          : !actor
            ? "wait"
            : approval && !approval.ok
              ? "open"
              : "met",
    },
    {
      id: "filing",
      title: labels.filingTitle,
      detail:
        selected.filing_status === "verified"
          ? `${labels.filingMet} ${selected.filing_evidence_ref ?? ""}`.trim()
          : `${filingLabel(selected.filing_status, locale)}. ${labels.filingWait}`,
      tone: selected.filing_status === "verified" ? "met" : "wait",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {!session ? (
        <p className="rounded-card border border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
          {labels.signInRequired}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <section aria-label={labels.queue} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{labels.queue}</h3>
          <ul className="flex flex-col gap-2">
            {pending.map((row) => {
              const name = taxpayers[row.taxpayer_id]?.legal_name ?? labels.none;
              const active = row.id === selected.id;
              const rowFindings = caseFindings({
                c: row,
                taxpayer: {
                  ...(taxpayers[row.taxpayer_id] ?? tp),
                  profile_verified: Boolean(taxpayers[row.taxpayer_id]?.profile_verified),
                },
                requests: requests[row.id] ?? [],
              });
              const rowBlocked = findingsBlock(rowFindings);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(row.id)}
                    className={`flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left ${
                      active ? "border-navy bg-navy-soft" : "border-border bg-surface"
                    }`}
                  >
                    <span className="text-sm font-semibold text-fg">{name}</span>
                    <span className="text-xs text-fg-muted">
                      {obligationLabel(row.obligation_code, locale)} ·{" "}
                      <span className="tnum font-mono">{row.period_token}</span>
                    </span>
                    <span className={`text-xs font-semibold ${rowBlocked ? "text-danger-text" : "text-fg-subtle"}`}>
                      {stageLabel(row.stage, locale)} · {filingLabel(row.filing_status, locale)}
                      {row.due_on ? ` · ${row.due_on}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-card border border-border bg-surface">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h3 className="font-display text-base font-semibold text-fg">{tp.legal_name}</h3>
              <p className="text-sm text-fg-muted">
                {obligationLabel(selected.obligation_code, locale)} ·{" "}
                <span className="tnum font-mono">{selected.period_token}</span>
              </p>
              <p className="mt-1 text-xs text-fg-subtle">
                {labels.due}{" "}
                <span className="tnum font-mono">{selected.due_on ?? labels.none}</span>
                {selected.due_needs_confirmation ? ` · ${labels.advisory}` : ""}
                {" · "}
                {labels.preparedBy} {selected.prepared_by ?? labels.none} · {labels.reviewer}{" "}
                {selected.approved_by ?? labels.none}
              </p>
              {selected.self_approved ? (
                <p className="mt-1 text-xs font-semibold text-amber-text">{labels.selfApproved}</p>
              ) : null}
            </div>
            <Link
              href={`/${locale}/workspace/cases/${selected.id}`}
              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-navy underline-offset-2 hover:underline"
            >
              {labels.openFile}
            </Link>
          </header>

          <ol className="flex flex-col gap-2 px-5 py-4">
            {checks.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 rounded-lg border border-border px-3 py-3 sm:flex-row sm:gap-4">
                <StatusMark tone={item.tone} word={statusWord(item.tone, labels)} />
                <div>
                  <p className="text-sm font-semibold text-fg">{item.title}</p>
                  <p className="text-sm text-fg-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          {advisoryList.length > 0 ? (
            <div className="flex flex-col gap-2 px-5 pb-2">
              {advisoryList.map((f) => (
                <p key={f.code} className="rounded-lg border border-amber-text/30 bg-amber-soft px-3 py-2 text-sm text-amber-text">
                  <span className="sr-only">{labels.advisory}: </span>
                  {locale === "fr" ? f.fr : f.en}
                </p>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
            {selected.stage === "review" ? (
              <button
                type="button"
                disabled={blocked || !actor || (approval !== null && !approval.ok) || busy === selected.id}
                onClick={() => void approve(selected, caseRequests)}
                className={`${btn} bg-teal-text text-surface hover:opacity-90`}
              >
                {blocked ? labels.approveBlocked : labels.approve}
              </button>
            ) : null}
            {next ? (
              <>
                {next === "verified" ? (
                  <>
                    <label htmlFor={`ev-${selected.id}`} className="sr-only">
                      {labels.evidencePlaceholder}
                    </label>
                    <input
                      id={`ev-${selected.id}`}
                      value={evidence[selected.id] ?? ""}
                      onChange={(e) =>
                        setEvidence((prev) => ({ ...prev, [selected.id]: e.target.value }))
                      }
                      placeholder={labels.evidencePlaceholder}
                      className="min-h-[44px] min-w-[12rem] flex-1 rounded-lg border border-border bg-surface px-3 font-mono text-sm text-fg"
                    />
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={!actor || (filingAllowed !== null && !filingAllowed.ok) || busy === selected.id}
                  onClick={() => void recordStep(selected, next)}
                  className={`${btn} bg-teal-text text-surface hover:opacity-90`}
                >
                  {filingButton(next, labels)}
                </button>
              </>
            ) : null}
            {showDisclose ? (
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={disclose[selected.id] === true}
                  onChange={(e) =>
                    setDisclose((prev) => ({ ...prev, [selected.id]: e.target.checked }))
                  }
                  className="size-4"
                />
                {labels.discloseSelf}
              </label>
            ) : null}
            {gate ? (
              <p className="w-full text-sm text-amber-text" role="status">
                {gate}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
