"use client";
import { ledgerBalance } from "@/lib/billing";
import { formatXaf } from "@/lib/i18n";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { useRealtime } from "@/lib/use-realtime";
import { WorkDrawer, type DrawerItem } from "@/components/live/work-drawer";
import { Card, CardHeader } from "@/components/ui";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  awaitingClient,
  clientStatus,
  clientStatusLabel,
  deriveBlocker,
  effectiveBlocker,
  obligationLabel,
  stageLabel,
  queueOrder,
  risk,
  canAdvance,
  type CaseRequest,
  type CaseTask,
  type ComplianceCase,
  type CaseStage,
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
  on_track: "border-success/40 bg-success-soft text-success-text",
};

const PIPELINE_STAGES: CaseStage[] = [
  "documents",
  "accounting",
  "preparation",
  "review",
  "filing",
  "evidence",
  "client_approval",
  "delivered",
];

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

/** Whole days since an ISO timestamp, floored at 0 — the age a reviewer cares about. */
function daysWaiting(iso: string): number {
  const start = Date.parse(iso);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

function Tile({
  label,
  value,
  hint,
  trend,
  tone,
  href,
}: {
  label: string;
  value: number;
  hint?: string;
  trend?: string;
  tone: "neutral" | "amber" | "danger" | "success";
  href?: string;
}) {
  const accent =
    tone === "danger"
      ? "text-danger-text"
      : tone === "amber"
        ? "text-amber-text"
        : tone === "success"
          ? "text-success-text"
          : "text-fg";
  const inner = (
    <>
      <p className="flex items-baseline gap-2">
        <span className={`tnum font-display text-3xl font-semibold leading-none ${accent}`}>
          {value}
        </span>
        {trend && <span className="text-xs font-medium text-fg-subtle">{trend}</span>}
      </p>
      <p className="mt-2 text-sm font-medium text-fg-muted">{label}</p>
      {hint && <p className="mt-0.5 text-xs leading-tight text-fg-subtle">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="rounded-card border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-raised">
        {inner}
      </Link>
    );
  }
  return <div className="rounded-card border border-border bg-surface p-4">{inner}</div>;
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
  const [live, setLive] = useState(false);
  const toast = useToast();
  const [drawer, setDrawer] = useState<{ title: string; items: DrawerItem[] } | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [dragId, setDragId] = useState<string | null>(null);
  const [clientQ, setClientQ] = useState("");
  const [stageFilter, setStageFilter] = useState<CaseStage | "">("");
  const [riskFilter, setRiskFilter] = useState<Risk | "">("");
  const [viewName, setViewName] = useState("");
  const [savedViews, setSavedViews] = useState<Record<string, { clientQ: string; stage: CaseStage | ""; risk: Risk | "" }>>({});

  useEffect(() => {
    const raw = localStorage.getItem("kima.pipeline.views");
    if (raw) { try { setSavedViews(JSON.parse(raw)); } catch { /* ignore a corrupt view */ } }
  }, []);
  const [money, setMoney] = useState<{ billed: number; collected: number; outstanding: number; awaiting: number; overdue: number } | null>(null);
  const [pendingDocs, setPendingDocs] = useState<{ id: string; file_name: string; taxpayer_id: string; created_at: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [cases, reqs, tsk, evs, tps, inv, pay, docs] = await Promise.all([
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
        db.from("invoices").select("id, total_minor, status, due_on"),
        db.from("service_payments").select("id, invoice_id, amount_minor, status"),
        db.from("documents").select("id, file_name, taxpayer_id, created_at").eq("review_status", "pending").order("created_at", { ascending: true }).limit(50),
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
      {
        const invRows = (inv.data ?? []) as { id: string; total_minor: number; status: string; due_on: string | null }[];
        const payRows = (pay.data ?? []) as { id: string; invoice_id: string; amount_minor: number; status: string }[];
        let billed = 0;
        let collected = 0;
        let outstanding = 0;
        let overdue = 0;
        const todayIso = todayISO();
        for (const row of invRows) {
          if (row.status === "void" || row.status === "draft") continue;
          const bal = ledgerBalance(payRows as never, row.id);
          billed += row.total_minor;
          collected += bal.confirmed;
          const left = row.total_minor - bal.confirmed;
          if (left > 0) {
            outstanding += left;
            if (row.due_on && row.due_on < todayIso) overdue += left;
          }
        }
        const awaiting = payRows.filter((x) => x.status === "pending_confirmation").reduce((s, x) => s + x.amount_minor, 0);
        setMoney({ billed, collected, outstanding, awaiting, overdue });
        setPendingDocs((docs.data ?? []) as { id: string; file_name: string; taxpayer_id: string; created_at: string }[]);
      }
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

  // One channel for everything the board reads: any change re-derives the
  // numbers, so the dashboard can never keep showing yesterday's answer.
  useRealtime(
    "firm-dashboard",
    ["compliance_cases", "document_requests", "documents", "case_tasks", "case_events", "invoices", "service_payments"],
    ({ table, event }) => {
      setLive(true);
      void load();
      if (table === "documents" && event === "INSERT") toast(t.clientUploaded);
    },
  );

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const today = todayISO();

  const metrics = useMemo(() => {
    const open = rows ?? [];
    const waiting = open.filter((c) => awaitingClient(requests[c.id] ?? [])).length;
    const review = open.filter((c) => c.stage === "review").length;
    // Firm-side holds only. A request still with the client is the waiting
    // tile, not this one — the two questions stay apart.
    const blocked = open.filter((c) => {
      const derived = deriveBlocker({
        tasks: tasks[c.id] ?? [],
        requests: requests[c.id] ?? [],
      });
      if (derived?.waiting_on === "firm") return true;
      return !derived && Boolean(c.blocker?.trim());
    }).length;
    const weekAgo = daysAgoISO(7);
    const openedThisWeek = open.filter((c) => (c.opened_at ?? "") >= weekAgo).length;
    const overdue = open.filter((c) => risk(c, today) === "overdue").length;
    const dueSoon = open.filter((c) => risk(c, today) === "due_soon").length;
    return { active: open.length, waiting, review, blocked, openedThisWeek, overdue, dueSoon };
  }, [rows, requests, tasks, today]);

  const ordered = useMemo(() => queueOrder(rows ?? [], today).slice(0, 5), [rows, today]);

  const deadlines = useMemo(
    () =>
      [...(rows ?? [])]
        .filter((c) => c.due_on)
        .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""))
        .slice(0, 4),
    [rows],
  );

  // One column per stage: the whole firm's work, in the order work moves.
  // A saved view is a set of filters over the same rows, per browser.
  const filteredRows = useMemo(() => {
    let r = rows ?? [];
    const q = clientQ.trim().toLowerCase();
    if (q) r = r.filter((c) => (c.taxpayer_name ?? names[c.taxpayer_id] ?? "").toLowerCase().includes(q));
    if (stageFilter) r = r.filter((c) => c.stage === stageFilter);
    if (riskFilter) r = r.filter((c) => risk(c, today) === riskFilter);
    return r;
  }, [rows, clientQ, stageFilter, riskFilter, names, today]);

  const pipeline = useMemo(
    () =>
      PIPELINE_STAGES.map((stage) => ({
        stage,
        cases: filteredRows.filter((c) => c.stage === stage),
      })),
    [rows],
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t.greetingMorning;
    if (h < 18) return t.greetingAfternoon;
    return t.greetingEvening;
  }, [t]);

  const nameOf = (c: Row) => c.taxpayer_name ?? names[c.taxpayer_id] ?? t.unnamedClient;

  // Attention rail: each bucket is a query over the same rows and opens the
  // work drawer — context preserved, no route jump.
  const buckets = useMemo(() => {
    const open = rows ?? [];
    const caseItems = (cs: Row[]) =>
      cs.map((c) => ({
        id: c.id,
        primary: c.taxpayer_name ?? names[c.taxpayer_id] ?? t.unnamedClient,
        secondary: obligationLabel(c.obligation_code, locale) + " · " + c.period_token,
        href: `/${locale}/workspace/cases/${c.id}`,
      }));
    const waiting = open.filter((c) => awaitingClient(requests[c.id] ?? []));
    const blocked = open.filter((c) => {
      const d = deriveBlocker({ tasks: tasks[c.id] ?? [], requests: requests[c.id] ?? [] });
      return d?.waiting_on === "firm" || (!d && Boolean(c.blocker?.trim()));
    });
    return [
      { key: "active", title: t.activeCases, items: caseItems(open) },
      { key: "waiting", title: t.waitingOnClients, items: caseItems(waiting) },
      { key: "review", title: t.pendingReview, items: caseItems(open.filter((c) => c.stage === "review")) },
      { key: "blocked", title: t.blocked, items: caseItems(blocked) },
      { key: "dueSoon", title: t.dueSoon, items: caseItems(open.filter((c) => risk(c, today) === "due_soon")) },
      { key: "overdue", title: t.overdue, items: caseItems(open.filter((c) => risk(c, today) === "overdue")) },
      { key: "docs", title: t.docsReceived, items: pendingDocs.map((d) => ({ id: d.id, primary: (names[d.taxpayer_id] ?? t.unnamedClient) + " — " + d.file_name, secondary: daysWaiting(d.created_at) + " " + t.reviewDays, href: `/${locale}/workspace/inbox` })) },
    ];
  }, [rows, requests, tasks, pendingDocs, names, today, locale, t]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">{greeting}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t.subtitle}</p>
        </div>
        <p className="flex items-center gap-2">
          <span className={"h-1.5 w-1.5 rounded-full " + (live ? "bg-teal" : "bg-fg-subtle")} aria-hidden />
          <span className="tnum font-mono text-xs text-fg-subtle">{live ? t.liveLabel : today}</span>
        </p>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile
            label={t.activeCases}
            value={metrics.active}
            tone="neutral"
            trend={metrics.openedThisWeek > 0 ? `+${metrics.openedThisWeek}` : undefined}
            href={`/${locale}/workspace/cases`}
          />
          <Tile label={t.waitingOnClients} value={metrics.waiting} tone="amber" href={`/${locale}/workspace/queue`} />
          <Tile label={t.pendingReview} value={metrics.review} tone="neutral" href={`/${locale}/workspace/reviews`} />
          <Tile
            label={t.blocked}
            value={metrics.blocked}
            hint={t.blockedHint}
            tone={metrics.blocked > 0 ? "danger" : "success"}
            href={`/${locale}/workspace/queue`}
          />
          <Tile
            label={t.moneyAwaiting}
            value={money?.awaiting ?? 0}
            tone={money && money.awaiting > 0 ? "amber" : "neutral"}
            href={`/${locale}/workspace/billing`}
          />
          <Tile label={t.docsReceived} value={pendingDocs.length} tone="neutral" href={`/${locale}/workspace/inbox`} />
        </div>
      )}

      {/* Attention rail — every row opens the work drawer. */}
      <section className="rounded-card border border-border bg-surface p-3">
        <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.attentionTitle}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {buckets.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setDrawer({ title: b.title, items: b.items })}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-border bg-surface-sunken px-3 text-sm font-medium text-fg hover:border-teal/40 hover:bg-surface"
            >
              <span className="tnum font-mono text-xs text-fg-muted">{b.items.length}</span>
              {b.title}
            </button>
          ))}
        </div>
      </section>

      {/* F2 + F3: the money, and what is ageing in review. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t.moneyTitle}
            action={
              <Link
                href={`/${locale}/workspace/billing`}
                className="inline-flex min-h-[44px] items-center text-xs font-semibold text-teal-text underline-offset-2 hover:underline"
              >
                {t.viewAll}
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
            {[
              { label: t.moneyBilled, value: money?.billed ?? 0 },
              { label: t.moneyCollected, value: money?.collected ?? 0 },
              { label: t.moneyOutstanding, value: money?.outstanding ?? 0 },
              { label: t.moneyAwaiting, value: money?.awaiting ?? 0 },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{s.label}</p>
                <p className="tnum mt-1 font-mono text-sm font-semibold text-fg">
                  {formatXaf(s.value, locale)} XAF
                </p>
              </div>
            ))}
            {money && money.overdue > 0 && (
              <p className="col-span-2 text-[11px] text-danger-text sm:col-span-4">
                {t.moneyOverdue} : {formatXaf(money.overdue, locale)} XAF
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t.reviewTitle}
            action={
              <Link
                href={`/${locale}/workspace/inbox`}
                className="inline-flex min-h-[44px] items-center text-xs font-semibold text-teal-text underline-offset-2 hover:underline"
              >
                {t.viewAll}
              </Link>
            }
          />
          <div className="p-4 sm:p-5">
            {pendingDocs.length === 0 ? (
              <p className="text-sm text-fg-muted">{t.reviewEmpty}</p>
            ) : (
              <>
                <p className="text-sm text-fg-muted">
                  {t.reviewOldest} {daysWaiting(pendingDocs[0].created_at)} {t.reviewDays}
                </p>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {pendingDocs.slice(0, 3).map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-fg">
                        {names[d.taxpayer_id] ?? t.unnamedClient} — {d.file_name}
                      </span>
                      <span className="tnum shrink-0 font-mono text-xs text-fg-subtle">
                        {daysWaiting(d.created_at)} {t.reviewDays}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Pipeline: every open case, at the stage it is in. */}
      <Card>
        <CardHeader
          title={t.pipelineTitle}
          action={
            <div className="flex items-center gap-3">
              <div role="group" aria-label={t.pipelineTitle} className="flex rounded-lg border border-border p-0.5">
                <button type="button" onClick={() => setView("kanban")} className={"inline-flex min-h-[36px] items-center rounded-md px-3 text-xs font-semibold " + (view === "kanban" ? "bg-surface-sunken text-fg" : "text-fg-muted hover:text-fg")}>{t.viewKanban}</button>
                <button type="button" onClick={() => setView("list")} className={"inline-flex min-h-[36px] items-center rounded-md px-3 text-xs font-semibold " + (view === "list" ? "bg-surface-sunken text-fg" : "text-fg-muted hover:text-fg")}>{t.viewList}</button>
              </div>
              <Link href={queueHref} className="inline-flex min-h-[44px] items-center text-xs font-semibold text-teal-text underline-offset-2 hover:underline">{t.viewAll}</Link>
            </div>
          }
        />
        <div className="p-4 sm:p-5">
          <p className="text-sm text-fg-muted">{t.pipelineHint}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={clientQ} onChange={(e) => setClientQ(e.target.value)} placeholder={t.filterPlaceholder} className="min-h-[36px] rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-teal/40" />
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as CaseStage | "")} className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm text-fg">
              <option value="">{t.stageAll}</option>
              {PIPELINE_STAGES.map((s) => (<option key={s} value={s}>{stageLabel(s, locale)}</option>))}
            </select>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as Risk | "")} className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm text-fg">
              <option value="">{t.riskAll}</option>
              <option value="overdue">{t.overdue}</option>
              <option value="due_soon">{t.dueSoon}</option>
              <option value="on_track">{t.riskOnTrack}</option>
              <option value="unknown">{t.riskUnknown}</option>
            </select>
            <span className="text-fg-subtle" aria-hidden>|</span>
            <input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder={t.viewName} className="min-h-[36px] w-36 rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-teal/40" />
            <button type="button" onClick={() => { const next = { ...savedViews, [viewName]: { clientQ, stage: stageFilter, risk: riskFilter } }; setSavedViews(next); localStorage.setItem("kima.pipeline.views", JSON.stringify(next)); setViewName(""); }} className="min-h-[36px] rounded-lg bg-[#18243B] px-3 text-sm font-semibold text-white hover:bg-[#24314d]">{t.saveView}</button>
            <select value="" onChange={(e) => { const v = savedViews[e.target.value]; if (v) { setClientQ(v.clientQ); setStageFilter(v.stage); setRiskFilter(v.risk); } }} className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm text-fg">
              <option value="">{t.savedViews}</option>
              {Object.keys(savedViews).map((k) => (<option key={k} value={k}>{k}</option>))}
            </select>
          </div>

          {view === "kanban" ? (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {pipeline.map(({ stage, cases }) => (
              <section
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const card = (rows ?? []).find((r) => r.id === dragId);
                  if (!card || card.stage === stage) { setDragId(null); return; }
                  if (canAdvance(card.stage, stage)) {
                    toast(`${t.moveReady} ${stageLabel(stage, locale)}`);
                  } else {
                    toast(t.moveRefused);
                  }
                  setDragId(null);
                }}
                className="flex w-[15rem] shrink-0 flex-col gap-2 rounded-xl border border-border bg-surface-sunken/60 p-2.5"
              >
                <header className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    {stageLabel(stage, locale)}
                  </h3>
                  <span className="tnum rounded-full bg-surface px-2 py-0.5 font-mono text-[11px] text-fg-muted">
                    {cases.length}
                  </span>
                </header>
                {cases.length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-fg-subtle">{t.pipelineEmpty}</p>
                ) : (
                  cases.slice(0, 4).map((c) => {
                    const r = risk(c, today);
                    return (
                      <Link
                        key={c.id}
                        draggable
                        onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; }}
                        href={`/${locale}/workspace/cases/${c.id}`}
                        className="rounded-lg border border-border bg-surface px-2.5 py-2 transition hover:border-teal/40 hover:shadow-card"
                      >
                        <p className="truncate text-xs font-semibold text-fg">
                          {c.taxpayer_name ?? names[c.taxpayer_id] ?? t.unnamedClient}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-fg-muted">
                          {obligationLabel(c.obligation_code, locale)}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-subtle">
                          <span className={`h-1.5 w-1.5 rounded-full ${RISK_TONE[r]}`} aria-hidden />
                          <span className="tnum font-mono">{c.due_on}</span>
                        </p>
                      </Link>
                    );
                  })
                )}
                {cases.length > 4 && (
                  <Link
                    href={queueHref}
                    className="px-1 text-[11px] font-semibold text-teal-text hover:underline"
                  >
                    +{cases.length - 4} {t.pipelineMore}
                  </Link>
                )}
              </section>
            ))}
          </div>
          ) : (
          <ul className="mt-4 flex flex-col gap-1">
            {queueOrder(filteredRows, today).map((c) => {
              const r = risk(c, today);
              return (
                <li key={c.id}>
                  <Link
                    href={`/${locale}/workspace/cases/${c.id}`}
                    className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 text-sm hover:border-teal/40"
                  >
                    <span className="min-w-0 truncate font-medium text-fg">{nameOf(c)}</span>
                    <span className="shrink-0 text-xs text-fg-muted">{stageLabel(c.stage, locale)} · {obligationLabel(c.obligation_code, locale)}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-subtle"><span className={`h-1.5 w-1.5 rounded-full ${RISK_TONE[r]}`} aria-hidden /><span className="tnum font-mono">{c.due_on}</span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
          )}
        </div>
      </Card>

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
                            <td className="py-3 pr-3 align-top font-medium">
                              <Link
                                href={`/${locale}/workspace/cases/${c.id}`}
                                className="text-fg hover:text-navy hover:underline"
                              >
                                {nameOf(c)}
                              </Link>
                            </td>
                            <td className="py-3 pr-3 text-fg-muted">
                              {obligationLabel(c.obligation_code, locale)}
                              <span className="ml-1.5 font-mono text-xs text-fg-subtle">
                                {c.period_token}
                              </span>
                            </td>
                            <td className="py-3 pr-3">
                              <span className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs font-medium text-fg">
                                {stageLabel(c.stage, locale)}
                              </span>
                              <span className="mt-1 block text-xs text-fg-subtle">
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
                          <Link
                            href={`/${locale}/workspace/cases/${c.id}`}
                            className="font-medium text-fg hover:text-navy hover:underline"
                          >
                            {nameOf(c)}
                          </Link>
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

      {drawer && (
        <WorkDrawer
          title={drawer.title}
          items={drawer.items}
          empty={t.activityEmpty}
          closeLabel={t.drawerClose}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
