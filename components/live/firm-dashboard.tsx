"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader } from "@/components/ui";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  awaitingClient,
  clientStatus,
  clientStatusLabel,
  effectiveBlocker,
  obligationLabel,
  queueOrder,
  risk,
  type CaseRequest,
  type CaseTask,
  type ComplianceCase,
  type Risk,
} from "@/lib/cases";
import { describe, type CaseEvent } from "@/lib/events";

/**
 * The practice dashboard — what is happening across every client, today.
 *
 * EVERY NUMBER IS DERIVED FROM THE SAME RECORDS THE REST OF THE PRODUCT USES.
 * No tile stores a count. "Waiting on clients" asks the same `awaitingClient()`
 * the client portal asks, so the firm cannot believe it is waiting on a client
 * while that client is being told nothing is owed — which is the interaction
 * rule the whole design handoff turns on.
 *
 * WHAT IT WILL NOT DO IS INVENT MOVEMENT. The reference design shows a trend
 * beside each tile ("+2 this week"). One of those is honest, because
 * `opened_at` is recorded; the others would need history nobody keeps, so they
 * are absent. A dashboard that fabricates a trend is worse than one with none.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>;

type Row = ComplianceCase & { taxpayer_name?: string | null };

const RISK_TONE: Record<Risk, string> = {
  overdue: "border-danger-text/40 bg-danger-soft text-danger-text",
  due_soon: "border-amber/50 bg-amber-soft text-amber-text",
  unknown: "border-border-strong bg-surface-sunken text-fg-muted",
  on_track: "border-teal/40 bg-teal-soft text-teal-text",
};

function groupByCase<T extends { case_id: string | null }>(rows: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    if (!r.case_id) continue;
    (out[r.case_id] ??= []).push(r);
  }
  return out;
}

/** Local date, not UTC: "today" in Douala is not today in London. */
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function Tile({
  label,
  value,
  hint,
  trend,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  trend?: string;
  tone: "neutral" | "amber" | "danger" | "teal";
}) {
  const accent =
    tone === "danger"
      ? "text-danger-text"
      : tone === "amber"
        ? "text-amber-text"
        : tone === "teal"
          ? "text-teal-text"
          : "text-fg";
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="flex items-baseline gap-2">
        <span className={`tnum font-display text-3xl font-semibold leading-none ${accent}`}>
          {value}
        </span>
        {trend && <span className="text-xs font-medium text-fg-subtle">{trend}</span>}
      </p>
      <p className="mt-2 text-sm font-medium text-fg-muted">{label}</p>
      {hint && <p className="mt-0.5 text-xs leading-tight text-fg-subtle">{hint}</p>}
    </div>
  );
}

export function FirmDashboard({
  locale,
  t,
  queueHref,
}: {
  locale: "fr" | "en";
  t: Dict["dashboard"];
  queueHref: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [requests, setRequests] = useState<Record<string, CaseRequest[]>>({});
  const [tasks, setTasks] = useState<Record<string, CaseTask[]>>({});
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [cases, reqs, tsk, evs, tps] = await Promise.all([
        db
          .from("compliance_cases")
          .select(
            "id, taxpayer_id, engagement_id, obligation_code, period_token, due_on, due_needs_confirmation, due_basis, stage, owner, blocker, opened_at, closed_at, filing_status, filing_reference, filing_evidence_ref, filing_attempted_at, filing_verified_at, payment_evidence_status, billing_status, prepared_by, prepared_at, approved_by, approved_at, self_approved",
          )
          .is("closed_at", null),
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
        db
          .from("case_events")
          // The ordering contract the event log documents.
          .select(
            "id, case_id, occurred_at, dimension, kind, actor_role, actor_label, from_value, to_value, subject_ref, reason, visibility",
          )
          .order("occurred_at", { ascending: false })
          .limit(8),
        db.from("taxpayers").select("id, legal_name"),
      ]);

      if (cases.error) throw cases.error;
      setRows((cases.data ?? []) as Row[]);
      setRequests(groupByCase((reqs.data ?? []) as CaseRequest[]));
      setTasks(groupByCase((tsk.data ?? []) as CaseTask[]));
      setEvents((evs.data ?? []) as CaseEvent[]);
      setNames(
        Object.fromEntries(
          ((tps.data ?? []) as { id: string; legal_name: string }[]).map((x) => [
            x.id,
            x.legal_name,
          ]),
        ),
      );
    } catch {
      // Nothing rather than stale numbers: a dashboard that keeps showing the
      // last good figure during an outage is how a deadline gets missed.
      setOffline(true);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayISO();

  const metrics = useMemo(() => {
    const open = rows ?? [];
    const waiting = open.filter((c) => awaitingClient(requests[c.id] ?? [])).length;
    const review = open.filter((c) => c.stage === "review").length;
    const atRisk = open.filter((c) => ["overdue", "due_soon"].includes(risk(c, today))).length;
    const weekAgo = daysAgoISO(7);
    const openedThisWeek = open.filter((c) => (c.opened_at ?? "") >= weekAgo).length;
    return { active: open.length, waiting, review, atRisk, openedThisWeek };
  }, [rows, requests, today]);

  const ordered = useMemo(() => queueOrder(rows ?? [], today).slice(0, 5), [rows, today]);

  const deadlines = useMemo(
    () =>
      [...(rows ?? [])]
        .filter((c) => c.due_on)
        .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""))
        .slice(0, 4),
    [rows],
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t.greetingMorning;
    if (h < 18) return t.greetingAfternoon;
    return t.greetingEvening;
  }, [t]);

  const nameOf = (c: Row) => c.taxpayer_name ?? names[c.taxpayer_id] ?? t.unnamedClient;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">{greeting}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t.subtitle}</p>
        </div>
        <p className="tnum font-mono text-xs text-fg-subtle">{today}</p>
      </div>

      {offline && (
        <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text">
          {t.offline}
        </p>
      )}

      {rows === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-card bg-surface-sunken" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label={t.activeCases}
            value={metrics.active}
            tone="neutral"
            trend={metrics.openedThisWeek > 0 ? `+${metrics.openedThisWeek}` : undefined}
          />
          <Tile label={t.waitingOnClients} value={metrics.waiting} tone="amber" />
          <Tile label={t.pendingReview} value={metrics.review} tone="neutral" />
          <Tile
            label={t.atRisk}
            value={metrics.atRisk}
            hint={t.atRiskHint}
            tone={metrics.atRisk > 0 ? "danger" : "teal"}
          />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={t.priorityTitle}
            action={
              <Link
                href={queueHref}
                className="inline-flex min-h-[44px] items-center text-xs font-semibold text-teal-text underline-offset-2 hover:underline"
              >
                {t.viewAll}
              </Link>
            }
          />
          <div className="p-4 sm:p-5">
            <p className="text-sm text-fg-muted">{t.prioritySubtitle}</p>

            {rows === null ? (
              <div className="mt-4 flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-sunken" />
                ))}
              </div>
            ) : ordered.length === 0 ? (
              <p className="mt-4 rounded-card border border-dashed border-border bg-surface-sunken p-5 text-center text-sm text-fg-muted">
                {t.empty}
              </p>
            ) : (
              <>
                {/* A table on a wide screen, stacked cards on a phone. The same
                    facts either way: a "mobile version" carrying less is how the
                    person in the field ends up working from less. */}
                <div className="mt-4 hidden overflow-x-auto sm:block">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                        <th className="py-2 pr-3 font-medium">{t.colClient}</th>
                        <th className="py-2 pr-3 font-medium">{t.colService}</th>
                        <th className="py-2 pr-3 font-medium">{t.colStatus}</th>
                        <th className="py-2 pr-3 font-medium">{t.colNext}</th>
                        <th className="py-2 font-medium">{t.colDue}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordered.map((c) => {
                        const reqs = requests[c.id] ?? [];
                        const blocker = effectiveBlocker(
                          c,
                          { tasks: tasks[c.id] ?? [], requests: reqs },
                          locale,
                        );
                        const r = risk(c, today);
                        return (
                          <tr key={c.id} className="border-b border-border/60 last:border-0">
                            <td className="py-3 pr-3 font-medium text-fg align-top">{nameOf(c)}</td>
                            <td className="py-3 pr-3 text-fg-muted">
                              {obligationLabel(c.obligation_code, locale)}
                              <span className="ml-1.5 font-mono text-xs text-fg-subtle">
                                {c.period_token}
                              </span>
                            </td>
                            <td className="py-3 pr-3">
                              <span className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs font-medium text-fg-muted">
                                {clientStatusLabel(clientStatus(c, awaitingClient(reqs)), locale)}
                              </span>
                            </td>
                            <td
                              className={`py-3 pr-3 ${blocker ? "text-amber-text" : "text-fg-subtle"}`}
                            >
                              {blocker ?? t.noNext}
                            </td>
                            <td className="tnum whitespace-nowrap py-3 font-mono text-xs">
                              <span
                                className={`rounded-full border px-2 py-0.5 font-semibold ${RISK_TONE[r]}`}
                              >
                                {c.due_on ?? "—"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <ul className="mt-4 flex flex-col gap-2 sm:hidden">
                  {ordered.map((c) => {
                    const reqs = requests[c.id] ?? [];
                    const blocker = effectiveBlocker(
                      c,
                      { tasks: tasks[c.id] ?? [], requests: reqs },
                      locale,
                    );
                    const r = risk(c, today);
                    return (
                      <li key={c.id} className="rounded-card border border-border bg-surface p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-medium text-fg">{nameOf(c)}</p>
                          <span
                            className={`tnum shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs font-semibold ${RISK_TONE[r]}`}
                          >
                            {c.due_on ?? "—"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-fg-muted">
                          {obligationLabel(c.obligation_code, locale)}{" "}
                          <span className="font-mono text-xs text-fg-subtle">{c.period_token}</span>
                        </p>
                        <p
                          className={`mt-2 border-t border-border pt-2 text-xs ${blocker ? "text-amber-text" : "text-fg-subtle"}`}
                        >
                          {blocker ?? t.noNext}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t.deadlinesTitle} />
            <div className="p-4 sm:p-5">
              {deadlines.length === 0 ? (
                <p className="text-sm text-fg-subtle">{t.deadlinesEmpty}</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {deadlines.map((c) => {
                    const r = risk(c, today);
                    return (
                      <li key={c.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fg">
                            {obligationLabel(c.obligation_code, locale)}
                          </p>
                          <p className="truncate text-xs text-fg-subtle">{nameOf(c)}</p>
                        </div>
                        <span
                          className={`tnum shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs font-semibold ${RISK_TONE[r]}`}
                        >
                          {c.due_on}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.activityTitle} />
            <div className="p-4 sm:p-5">
              {events.length === 0 ? (
                <p className="text-sm text-fg-subtle">{t.activityEmpty}</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-3">
                    {events.map((e) => (
                      <li
                        key={e.id}
                        className="border-b border-border/60 pb-3 last:border-0 last:pb-0"
                      >
                        {/* One sentence, from the one place that writes it. */}
                        <p className="text-sm leading-snug text-fg">{describe(e, locale)}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
                          <span className="tnum font-mono">{e.occurred_at.slice(0, 10)}</span>
                          {e.actor_label && <span>· {e.actor_label}</span>}
                          <span
                            className={`rounded-full px-1.5 py-0.5 ${
                              e.visibility === "client"
                                ? "bg-teal-soft text-teal-text"
                                : "bg-surface-sunken text-fg-muted"
                            }`}
                          >
                            {e.visibility === "client" ? t.clientVisible : t.internalOnly}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-border pt-3 text-xs leading-snug text-fg-subtle">
                    {t.activityHint}
                  </p>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
