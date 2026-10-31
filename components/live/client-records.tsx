"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { sessionTaxpayerId, supabase } from "@/lib/supabase";
import { Card, CardHeader, Timeline } from "@/components/ui";
import { usePortalCopy } from "@/components/client-portal/copy";
import { EmptyState, PageHeading, Pill } from "@/components/client-portal/ui";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  awaitingClient,
  clientStatus,
  clientStep,
  clientStatusLabel,
  obligationLabel,
  type CaseRequest,
  type ClientStatus,
  type ComplianceCase,
} from "@/lib/cases";
import { describe, timeline, type CaseEvent } from "@/lib/events";
import { regime, taxCentre, type Regime, type TaxCentre } from "@/lib/rules";

/**
 * The client's record pages — compliance, declarations, archive — read from
 * the same rows the firm workspace reads (`taxpayers`, `compliance_cases`,
 * `document_requests`, `case_events`).
 *
 * These three pages used to render `lib/demo-data`: invented obligations with
 * invented due dates, while `lib/rules` and the case engine sat unused by
 * them. A portal that invents an obligation is worse than one that shows
 * nothing, so: no cases on record ⇒ an empty state, and a failed fetch ⇒ an
 * offline notice with no numbers at all (the dashboard rule).
 *
 * STATUS HONESTY. The client sees the five client states
 * (`clientStatusLabel`), never the firm's internal stages. A case is only in
 * the archive when its filing is `verified` AND carries an evidence
 * reference — the same rule the database CHECK enforces. "Filed — awaiting
 * proof" says exactly that and no more.
 */
type WorkspaceDict = ReturnType<typeof getWorkspaceDictionary>;
type ClientDict = WorkspaceDict["client"];
type RecordsDict = WorkspaceDict["clientRecords"];
type DashDict = WorkspaceDict["clientDash"];

type TaxpayerRow = {
  id: string;
  legal_name: string;
  niu: string | null;
  tax_centre: string | null;
  taxpayer_type: string | null;
  tax_regime: string | null;
  accounting_framework: string | null;
  profile_verified: boolean | null;
};

type Records = {
  taxpayer: TaxpayerRow | null;
  cases: ComplianceCase[];
  requests: CaseRequest[];
  events: CaseEvent[];
};

const CASE_COLUMNS =
  "id, taxpayer_id, engagement_id, obligation_code, period_token, due_on, due_needs_confirmation, due_basis, stage, owner, blocker, opened_at, closed_at, filing_status, filing_reference, filing_evidence_ref, filing_attempted_at, filing_verified_at, payment_evidence_status, billing_status, prepared_by, prepared_at, approved_by, approved_at, self_approved";

function useClientRecords() {
  const [records, setRecords] = useState<Records | null>(null);
  const [offline, setOffline] = useState(false);
  const loadEpoch = useRef(0);

  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    try {
      const db = supabase();
      const taxpayerId = await sessionTaxpayerId();
      if (epoch !== loadEpoch.current) return;
      if (!taxpayerId) throw new Error("Authenticated client context required");
      const [tp, cs, rq, ev] = await Promise.all([
        db
          .from("taxpayers")
          .select(
            "id, legal_name, niu, tax_centre, taxpayer_type, tax_regime, accounting_framework, profile_verified",
          )
          .eq("id", taxpayerId).maybeSingle(),
        db.from("compliance_cases").select(CASE_COLUMNS)
          .eq("taxpayer_id", taxpayerId).order("due_on", { ascending: true }),
        db
          .from("document_requests")
          .select("id, case_id, taxpayer_id, label_fr, label_en, status, responsible, due_on, returned_count")
          .eq("taxpayer_id", taxpayerId),
        db
          .from("case_events")
          .select(
            "id, case_id, occurred_at, dimension, kind, actor_role, actor_label, from_value, to_value, subject_ref, reason, visibility",
          )
          .eq("taxpayer_id", taxpayerId)
          .order("occurred_at", { ascending: false })
          .limit(50),
      ]);
      if (epoch !== loadEpoch.current) return;
      if (tp.error || cs.error || rq.error || ev.error) throw tp.error ?? cs.error ?? rq.error ?? ev.error;
      setRecords({
        taxpayer: (tp.data as TaxpayerRow | null) ?? null,
        cases: (cs.data ?? []) as ComplianceCase[],
        requests: (rq.data ?? []) as CaseRequest[],
        events: (ev.data ?? []) as CaseEvent[],
      });
      setOffline(false);
    } catch {
      if (epoch !== loadEpoch.current) return;
      setOffline(true);
      setRecords({ taxpayer: null, cases: [], requests: [], events: [] });
    }
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = supabase().auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return;
      // Clear prior-account records before any asynchronous re-query.
      ++loadEpoch.current;
      setRecords(null);
      setOffline(false);
      if (timer) clearTimeout(timer);
      // Supabase auth callbacks must not await another Supabase operation.
      timer = setTimeout(() => { void load(); }, 0);
    });
    return () => {
      ++loadEpoch.current;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [load]);

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
    try {
      channel = supabase()
        .channel("client-records")
        .on("postgres_changes", { event: "*", schema: "public", table: "compliance_cases" }, () => void load())
        .on("postgres_changes", { event: "*", schema: "public", table: "case_events" }, () => void load())
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      if (channel) void channel.unsubscribe();
    };
  }, [load]);

  return { records, offline, load };
}

function requestsByCase(requests: CaseRequest[]) {
  const out: Record<string, CaseRequest[]> = {};
  for (const r of requests) {
    if (!r.case_id) continue;
    (out[r.case_id] ??= []).push(r);
  }
  return out;
}

function statusOf(c: ComplianceCase, byCase: Record<string, CaseRequest[]>): ClientStatus {
  return clientStatus(c, awaitingClient(byCase[c.id] ?? []));
}

function StatusPill({ label, status }: { label: string; status: ClientStatus }) {
  const cls =
    status === "complete"
      ? "border-teal-text/30 bg-teal-soft text-teal-text"
      : status === "waiting_on_you"
        ? "border-amber-text/40 bg-amber-soft text-amber-text"
        : "border-border-strong bg-surface-sunken text-fg-muted";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function DueLine({ c, dash }: { c: ComplianceCase; dash: DashDict }) {
  if (!c.due_on) return null;
  return (
    <p className="tnum font-mono text-xs text-fg-subtle">
      {dash.dueOn} {c.due_on}
      {c.due_needs_confirmation && (
        <span className="ml-2 font-sans font-medium text-amber-text">{dash.provisional}</span>
      )}
    </p>
  );
}

function EvidenceLine({ c, r }: { c: ComplianceCase; r: RecordsDict }) {
  if (c.filing_evidence_ref) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
        <span className="font-medium">{r.evidence}</span>
        <code className="tnum rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs">
          {c.filing_evidence_ref}
        </code>
        {c.filing_verified_at && (
          <span className="tnum font-mono">{c.filing_verified_at.slice(0, 10)}</span>
        )}
      </span>
    );
  }
  if (c.stage === "filing" || c.stage === "evidence") {
    return <p className="text-xs font-medium text-amber-text">{r.noEvidenceYet}</p>;
  }
  return null;
}

function Shell({
  title,
  subtitle,
  records,
  offline,
  dash,
  r,
  children,
}: {
  title: string;
  subtitle: string;
  records: Records | null;
  offline: boolean;
  dash: DashDict;
  r: RecordsDict;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-fg">{title}</h1>
        <p className="text-sm text-fg-muted">{subtitle}</p>
      </div>
      {offline && (
        <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text">
          {dash.offline}
        </p>
      )}
      {records === null ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label={r.loading}>
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-28 rounded-card" />
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** Board 3/6 data, honestly: the four axes, each on its own row, never collapsed. */
export function ClientCompliance({
  locale,
  c,
  dash,
  r,
}: {
  locale: "fr" | "en";
  c: ClientDict;
  dash: DashDict;
  r: RecordsDict;
}) {
  const { records, offline } = useClientRecords();
  const byCase = useMemo(() => requestsByCase(records?.requests ?? []), [records]);

  const tp = records?.taxpayer;
  const regimeDef = tp?.tax_regime ? regime(tp.tax_regime as Regime) : undefined;
  const centreDef = tp?.tax_centre ? taxCentre(tp.tax_centre as TaxCentre) : undefined;
  const unverified = tp != null && !tp.profile_verified;
  const rows: { label: string; value: string }[] = tp
    ? [
        { label: c.niu, value: tp.niu ?? "—" },
        { label: c.regime, value: regimeDef ? (locale === "fr" ? regimeDef.fr : regimeDef.en) : (tp.tax_regime ?? "—") },
        { label: c.centre, value: centreDef ? (locale === "fr" ? centreDef.fr : centreDef.en) : (tp.tax_centre ?? "—") },
        { label: c.framework, value: tp.accounting_framework ?? "—" },
      ]
    : [];

  return (
    <Shell title={c.complianceTitle} subtitle={c.complianceSubtitle} records={records} offline={offline} dash={dash} r={r}>
      <Card>
        <CardHeader title={c.profileTitle} />
        {!tp ? (
          <p className="px-5 py-4 text-sm text-fg-muted">{r.profileEmpty}</p>
        ) : (
          <dl className="grid gap-px bg-border sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="bg-surface px-5 py-3">
                <dt className="text-xs uppercase tracking-wide text-fg-subtle">{row.label}</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                  <span className="tnum font-mono">{row.value}</span>
                  {unverified && (
                    <span className="rounded-full border border-dashed border-amber-text/40 bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber-text">
                      {c.unverified}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title={r.obligationsTitle} />
        {(records?.cases ?? []).length === 0 ? (
          <p className="px-5 py-4 text-sm text-fg-muted">{r.noCases}</p>
        ) : (
          <ul className="divide-y divide-border">
            {(records?.cases ?? []).map((cs) => {
              const status = statusOf(cs, byCase);
              return (
                <li key={cs.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${locale}/app/declarations/${cs.id}`}
                      className="text-sm font-medium text-fg underline-offset-2 hover:underline"
                    >
                      {obligationLabel(cs.obligation_code, locale)}
                    </Link>
                    <p className="tnum font-mono text-xs text-fg-subtle">{cs.period_token}</p>
                  </div>
                  <DueLine c={cs} dash={dash} />
                  <StatusPill label={clientStatusLabel(status, locale)} status={status} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Shell>
  );
}


/** Board 6/10 data: progress in the client's vocabulary, history from `case_events`. */
export function ClientDeclarations({
  locale,
  c,
  dash,
  r,
}: {
  locale: "fr" | "en";
  c: ClientDict;
  dash: DashDict;
  r: RecordsDict;
}) {
  const { records, offline } = useClientRecords();
  const byCase = useMemo(() => requestsByCase(records?.requests ?? []), [records]);
  const visibleEvents = useMemo(() => timeline(records?.events ?? [], "client"), [records]);
  const stepLabels = [dash.stepDocuments, dash.stepProgress, dash.stepReview, dash.stepFiling, dash.stepDone];

  return (
    <Shell title={c.declarationsTitle} subtitle={c.declarationsSubtitle} records={records} offline={offline} dash={dash} r={r}>
      {(records?.cases ?? []).length === 0 ? (
        <Card className="px-5 py-8">
          <p className="text-sm text-fg-muted">{r.noCases}</p>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {(records?.cases ?? []).map((cs) => {
            const status = statusOf(cs, byCase);
            const at = clientStep(status);
            const steps = stepLabels.map((label, i) => ({
              label,
              state: i < at ? ("done" as const) : i === at ? ("current" as const) : ("todo" as const),
            }));
            const history = visibleEvents.filter((e) => e.case_id === cs.id).slice(0, 4);
            return (
              <Card key={cs.id} className="rise-in flex flex-col">
                <CardHeader
                  title={`${obligationLabel(cs.obligation_code, locale)} — ${cs.period_token}`}
                  action={
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusPill label={clientStatusLabel(status, locale)} status={status} />
                      <Link
                        href={`/${locale}/app/declarations/${cs.id}`}
                        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text"
                      >
                        {r.openCase}
                      </Link>
                    </span>
                  }
                />
                <div className="flex flex-1 flex-col gap-4 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <DueLine c={cs} dash={dash} />
                    <EvidenceLine c={cs} r={r} />
                  </div>
                  <Timeline locale={locale} steps={steps} />
                  <div className="mt-auto border-t border-border pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{r.historyTitle}</p>
                    {history.length === 0 ? (
                      <p className="mt-1 text-xs text-fg-muted">{r.historyEmpty}</p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-2">
                        {history.map((e) => (
                          <li key={e.id} className="text-xs leading-snug text-fg-muted">
                            {describe(e, locale)}{" "}
                            <span className="tnum font-mono text-fg-subtle">{e.occurred_at.slice(0, 10)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

/** Board 10: the vault holds proof, not assertions — verified filing + evidence ref, or nothing. */
export function ClientArchive({
  locale,
  c,
  dash,
  r,
}: {
  locale: "fr" | "en";
  c: ClientDict;
  dash: DashDict;
  r: RecordsDict;
}) {
  const copy = usePortalCopy();
  const { records, offline } = useClientRecords();
  const [year, setYear] = useState("all");
  const [kind, setKind] = useState("all");

  const filed = useMemo(
    () =>
      (records?.cases ?? []).filter(
        (cs) => cs.filing_status === "verified" && Boolean(cs.filing_evidence_ref),
      ),
    [records],
  );
  const years = useMemo(
    () => [...new Set(filed.map((cs) => cs.period_token.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse(),
    [filed],
  );
  const types = useMemo(
    () => [...new Set(filed.map((cs) => obligationLabel(cs.obligation_code, locale)))].sort(),
    [filed, locale],
  );
  const shown = filed.filter((cs) => {
    if (year !== "all" && !cs.period_token.startsWith(year)) return false;
    if (kind !== "all" && obligationLabel(cs.obligation_code, locale) !== kind) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={copy.recordsTitle}
        subtitle={
          <span>
            <span className="block font-medium text-fg">{copy.vault}</span>
            <span>{copy.acceptedOnly}</span>
          </span>
        }
      />
      {offline && (
        <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text">{dash.offline}</p>
      )}
      {records === null ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <span className="sr-only">{r.loading}</span>
          <div className="h-28 animate-pulse rounded-card bg-white" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm text-fg-muted">
              <span className="sr-only">{copy.year}</span>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="min-h-[44px] rounded-lg border border-border bg-white px-3 text-sm text-fg">
                <option value="all">{copy.allYears}</option>
                {years.map((y) => (
                  <option key={y} value={y}>{copy.year} {y}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-fg-muted">
              <span className="sr-only">{copy.allTypes}</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="min-h-[44px] rounded-lg border border-border bg-white px-3 text-sm text-fg">
                <option value="all">{copy.allTypes}</option>
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          {shown.length === 0 ? (
            <EmptyState title={filed.length === 0 ? copy.noRecords : copy.recordsNoMatch} hint={filed.length === 0 ? copy.noRecordsHint : copy.recordsNoMatchHint} />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-fg-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 font-medium">{copy.colType}</th>
                    <th className="px-4 py-3 font-medium">{copy.colPeriod}</th>
                    <th className="px-4 py-3 font-medium">{copy.colStatus}</th>
                    <th className="px-4 py-3 font-medium">{copy.colDate}</th>
                    <th className="px-4 py-3 font-medium">{copy.colAction}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((cs) => (
                    <tr key={cs.id} className="border-b border-border last:border-0 hover:bg-surface-sunken">
                      <td className="px-4 py-3 font-medium text-fg">{obligationLabel(cs.obligation_code, locale)}</td>
                      <td className="tnum px-4 py-3 text-fg-muted">{cs.period_token}</td>
                      <td className="px-4 py-3">
                        <Pill tone="green">{copy.delivered}</Pill>
                      </td>
                      <td className="tnum px-4 py-3 text-fg-muted">{(cs.filing_verified_at ?? "").slice(0, 10) || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-fg-muted" title={copy.noFile}>
                          <code className="tnum font-mono text-xs">{cs.filing_evidence_ref}</code>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
