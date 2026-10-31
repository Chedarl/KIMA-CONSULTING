"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader } from "@/components/ui";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import type { Regime, TaxpayerType } from "@/lib/rules";
import {
  awaitingClient,
  clientStatus,
  clientStatusLabel,
  effectiveBlocker,
  obligationLabel,
  proposeCases,
  queueOrder,
  risk,
  stageLabel,
  unowned,
  type CaseRequest,
  type CaseStage,
  type CaseTask,
  type ComplianceCase,
  type Risk,
} from "@/lib/cases";

/**
 * The work queue — what is at risk, who owns it, and the one thing blocking it.
 *
 * Ordered by risk rather than by date, so the row a practitioner should open
 * first is the row at the top. The ordering treats an UNCONFIRMED deadline as
 * its own kind of work: a date resting on an unverified rule is not "fine", it
 * is a question nobody has answered, and sorting it below everything green
 * would let it drift until it is overdue.
 *
 * One blocker per row, never a list. A queue showing five reasons per case is a
 * queue nobody reads.
 *
 * The client-visible status sits beside the internal stage on purpose: the
 * practitioner can see at a glance what the client is being told, which is the
 * thing that generates the phone call.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>;

type Row = ComplianceCase & { taxpayer_name?: string | null };

/** Requests and tasks grouped by the case they belong to. */
type Work = { requests: Record<string, CaseRequest[]>; tasks: Record<string, CaseTask[]> };

const EMPTY_WORK: Work = { requests: {}, tasks: {} };

function groupByCase<T extends { case_id: string | null }>(rows: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    if (!r.case_id) continue;
    (out[r.case_id] ??= []).push(r);
  }
  return out;
}

const RISK_TONE: Record<Risk, string> = {
  overdue: "border-danger-text/40 bg-danger-soft text-danger-text",
  due_soon: "border-amber/50 bg-amber-soft text-amber-text",
  unknown: "border-border-strong bg-surface-sunken text-fg-muted",
  on_track: "border-success/40 bg-success-soft text-success-text",
};

export function WorkQueue({ locale, t }: { locale: "fr" | "en"; t: Dict["queue"] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [work, setWork] = useState<Work>(EMPTY_WORK);
  const [offline, setOffline] = useState(false);
  const [regime, setRegime] = useState<Regime>("reel");

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const { data, error } = await db
        .from("compliance_cases")
        .select(
          "id, taxpayer_id, engagement_id, obligation_code, period_token, due_on, due_needs_confirmation, due_basis, stage, owner, blocker, opened_at, closed_at, filing_status, filing_reference, filing_evidence_ref, filing_attempted_at, filing_verified_at, payment_evidence_status, billing_status, prepared_by, prepared_at, approved_by, approved_at, self_approved",
        )
        .is("closed_at", null);
      if (error) throw error;
      setRows((data ?? []) as Row[]);

      // The blocker and the client-facing status are DERIVED from these, not
      // read from the case's own `blocker` column -- a derived value cannot go
      // stale while a hand-written note survives the thing it described.
      const [reqs, tasks] = await Promise.all([
        db
          .from("document_requests")
          .select(
            "id, case_id, taxpayer_id, label_fr, label_en, status, responsible, due_on, returned_count",
          )
          .not("case_id", "is", null),
        db
          .from("case_tasks")
          .select(
            "id, case_id, title, detail, assigned_to, state, is_blocking, due_on, completed_at",
          ),
      ]);
      setWork({
        requests: groupByCase((reqs.data ?? []) as CaseRequest[]),
        tasks: groupByCase((tasks.data ?? []) as CaseTask[]),
      });
    } catch {
      setOffline(true);
      setRows([]);
      setWork(EMPTY_WORK);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const riskLabel = (r: Risk) =>
    r === "overdue"
      ? t.riskOverdue
      : r === "due_soon"
        ? t.riskSoon
        : r === "unknown"
          ? t.riskUnknown
          : t.riskOnTrack;

  const ordered = useMemo(() => queueOrder(rows ?? []), [rows]);
  const atRisk = useMemo(
    () => ordered.filter((c) => ["overdue", "due_soon"].includes(risk(c))).length,
    [ordered],
  );
  const ownerless = useMemo(() => unowned(ordered).length, [ordered]);

  // What a year of this client's obligations would produce. Shown so the
  // practitioner can see the engine's reasoning before anything is created —
  // these are proposals, and nothing here writes to the database.
  const proposed = useMemo(
    () =>
      proposeCases({
        type: "business_moral" as TaxpayerType,
        regime,
        year: new Date().getFullYear(),
      }),
    [regime],
  );

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title={t.title}
          action={
            <span className="text-xs text-fg-subtle">
              <strong className="font-semibold text-fg-muted">{ordered.length}</strong>{" "}
              {t.openCases}
              {atRisk > 0 && (
                <>
                  {" · "}
                  <strong className="font-semibold text-amber-text">{atRisk}</strong> {t.atRisk}
                </>
              )}
              {ownerless > 0 && (
                <>
                  {" · "}
                  <strong className="font-semibold text-danger-text">{ownerless}</strong>{" "}
                  {t.unowned}
                </>
              )}
            </span>
          }
        />
        <div className="p-4 sm:p-5">
          <p className="text-sm text-fg-muted">{t.subtitle}</p>

          {offline && <p className="mt-3 text-sm text-amber-text">{t.offline}</p>}

          {rows === null ? (
            <div className="mt-4 flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-sunken" />
              ))}
            </div>
          ) : ordered.length === 0 ? (
            <div className="mt-4 rounded-card border border-dashed border-border bg-surface-sunken p-5 text-center">
              <p className="text-sm font-medium text-fg">{t.empty}</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-fg-subtle">{t.emptyHint}</p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {ordered.map((c) => {
                const r = risk(c);
                const requests = work.requests[c.id] ?? [];
                const tasks = work.tasks[c.id] ?? [];
                const cs = clientStatus(c, awaitingClient(requests));
                const blocker = effectiveBlocker(c, { tasks, requests }, locale);
                return (
                  <li
                    key={c.id}
                    className="spotlight rounded-card border border-border bg-surface p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/${locale}/workspace/cases/${c.id}`}
                          className="text-sm font-semibold text-navy hover:underline"
                        >
                          {obligationLabel(c.obligation_code, locale)}
                        </Link>
                        <p className="mt-0.5 font-mono text-xs text-fg-subtle">
                          {c.period_token}
                          {c.taxpayer_name ? ` · ${c.taxpayer_name}` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${RISK_TONE[r]}`}
                      >
                        {riskLabel(r)}
                      </span>
                    </div>

                    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-fg-subtle">{t.dueOn}</dt>
                        <dd className="tnum mt-0.5 font-mono font-medium text-fg">
                          {c.due_on ?? "—"}
                        </dd>
                        {c.due_needs_confirmation && (
                          <dd className="mt-0.5 text-[11px] leading-tight text-amber-text">
                            {t.provisional}
                          </dd>
                        )}
                      </div>
                      <div>
                        <dt className="text-fg-subtle">{t.stage}</dt>
                        <dd className="mt-0.5 font-medium text-fg">
                          {stageLabel(c.stage as CaseStage, locale)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-fg-subtle">{t.owner}</dt>
                        <dd
                          className={`mt-0.5 font-medium ${c.owner ? "text-fg" : "text-danger-text"}`}
                        >
                          {c.owner ?? t.noOwner}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-fg-subtle">{t.clientSees}</dt>
                        <dd className="mt-0.5 font-medium text-fg-muted">
                          {clientStatusLabel(cs, locale)}
                        </dd>
                      </div>
                    </dl>

                    <p
                      className={`mt-2 border-t border-border pt-2 text-xs ${
                        blocker ? "text-amber-text" : "text-fg-subtle"
                      }`}
                    >
                      <span className="font-semibold">{t.blocker}: </span>
                      {blocker ?? t.noBlocker}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* What the engine would propose — the argument that nothing is configured */}
      <Card>
        <CardHeader title={t.generateTitle} />
        <div className="p-4 sm:p-5">
          <p className="text-sm text-fg-muted">{t.generateHint}</p>

          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-fg">{t.regime}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["reel", "igs"] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setRegime(x)}
                  aria-pressed={regime === x}
                  className={`min-h-[44px] rounded-lg border px-3 text-sm transition-colors ${
                    regime === x
                      ? "border-navy bg-navy font-semibold text-surface"
                      : "border-border text-fg-muted hover:bg-surface-sunken"
                  }`}
                >
                  {x === "reel" ? "Réel" : "IGS"}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="mt-3 text-xs text-fg-subtle">
            <strong className="font-semibold text-fg-muted">{proposed.length}</strong> {t.proposed}
          </p>

          <ul className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-sunken p-3">
            {proposed.map((p) => (
              <li
                key={`${p.obligation_code}:${p.period_token}`}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 py-1.5 last:border-0"
              >
                <span className="text-xs text-fg">
                  <span className="font-mono text-fg-subtle">{p.period_token}</span>{" "}
                  {obligationLabel(p.obligation_code, locale)}
                </span>
                <span className="tnum font-mono text-xs text-fg-muted">
                  {p.due_on}
                  {p.due_needs_confirmation && (
                    <span className="ml-1.5 text-amber-text" title={t.provisional}>
                      ?
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
