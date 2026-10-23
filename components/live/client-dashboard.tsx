"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { demoIds, supabase } from "@/lib/supabase";
import { submitRequestFile } from "@/lib/submit-request";
import { todayInDouala } from "@/lib/dates";
import { Card, CardHeader } from "@/components/ui";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  awaitingClient,
  clientStatus,
  obligationLabel,
  requestIsOutstanding,
  risk,
  waitsOn,
  type CaseRequest,
  type ClientStatus,
  type ComplianceCase,
} from "@/lib/cases";
import { describe, timeline, type CaseEvent } from "@/lib/events";

/**
 * The client's side of the same records.
 *
 * This screen and the firm dashboard read one set of rows. When an accountant
 * raises a request it appears here; when the client sends it, it moves into the
 * firm's queue. That is the interaction rule the design handoff calls
 * non-negotiable, and the only way to keep it is to have no second copy of
 * anything.
 *
 * RECEIVED IS NOT ACCEPTED. Sending a document moves it to `submitted`, never
 * to `accepted` — a client cannot mark their own document approved, and the
 * screen says so in words rather than letting a green tick imply it. This is
 * the one place a portal most easily misleads.
 *
 * IT SHOWS THE CLIENT VOCABULARY, NOT OURS. The reference design draws the
 * progress tracker from the firm's internal stages (documents, preparation,
 * review, filing). Those are ours. The tracker here is built from the five
 * client-facing states: it looks the same to a client, and does not leak which
 * draft went back to whom.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>;

const STEPS: ClientStatus[] = [
  "waiting_on_you",
  "in_progress",
  "in_review",
  "filed_awaiting_proof",
  "complete",
];

const todayISO = () => todayInDouala();

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
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
      <p className={`tnum font-display text-3xl font-semibold leading-none ${accent}`}>{value}</p>
      <p className="mt-2 text-sm font-medium text-fg-muted">{label}</p>
    </div>
  );
}

/** The five client states as a rail. Current step filled, the rest outlined. */
function ProgressRail({ current, labels }: { current: ClientStatus; labels: string[] }) {
  const at = STEPS.indexOf(current);
  return (
    <ol className="mt-3 flex flex-wrap gap-x-1 gap-y-2" aria-label={labels[at]}>
      {STEPS.map((s, i) => {
        const done = i < at;
        const here = i === at;
        return (
          <li key={s} className="flex min-w-0 flex-1 basis-16 flex-col gap-1">
            <span
              aria-hidden
              className={`h-1.5 rounded-full ${done ? "bg-teal" : here ? "bg-navy" : "bg-border"}`}
            />
            <span
              className={`truncate text-[11px] leading-tight ${
                here ? "font-semibold text-fg" : "text-fg-subtle"
              }`}
            >
              {labels[i]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ClientDashboard({
  locale,
  t,
  fallbackName,
  documentsHref,
}: {
  locale: "fr" | "en";
  t: Dict["clientDash"];
  /** Shown only until the record answers. The name belongs to the data. */
  fallbackName: string;
  documentsHref: string;
}) {
  const [clientName, setClientName] = useState(fallbackName);
  const [cases, setCases] = useState<ComplianceCase[] | null>(null);
  const [requests, setRequests] = useState<CaseRequest[]>([]);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [offline, setOffline] = useState(false);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ids, setIds] = useState<{ taxpayerId: string; organizationId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      setIds(await demoIds());
      const [cs, rq, ev, tp] = await Promise.all([
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
          ),
        db
          .from("case_events")
          .select(
            "id, case_id, occurred_at, dimension, kind, actor_role, actor_label, from_value, to_value, subject_ref, reason, visibility",
          )
          .order("occurred_at", { ascending: false })
          .limit(6),
        db.from("taxpayers").select("legal_name").limit(1),
      ]);
      if (cs.error) throw cs.error;
      const who = (tp.data ?? [])[0] as { legal_name?: string } | undefined;
      if (who?.legal_name) setClientName(who.legal_name);
      setCases((cs.data ?? []) as ComplianceCase[]);
      setRequests((rq.data ?? []) as CaseRequest[]);
      setEvents((ev.data ?? []) as CaseEvent[]);
    } catch {
      setOffline(true);
      setCases([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live, because a client who has just sent a document should not have to
  // refresh to learn it arrived, and an accountant's decision should reach them
  // without anyone pressing anything.
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
    try {
      const db = supabase();
      channel = db
        .channel("client-dashboard")
        .on("postgres_changes", { event: "*", schema: "public", table: "document_requests" }, () =>
          void load(),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "case_events" }, () =>
          void load(),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "compliance_cases" }, () =>
          void load(),
        )
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
    } catch {
      setLive(false);
    }
    return () => {
      if (channel) void channel.unsubscribe();
    };
  }, [load]);

  const today = todayISO();

  const owed = useMemo(
    () => requests.filter((r) => requestIsOutstanding(r.status) && waitsOn(r) === "client"),
    [requests],
  );

  const byCase = useMemo(() => {
    const out: Record<string, CaseRequest[]> = {};
    for (const r of requests) {
      if (!r.case_id) continue;
      (out[r.case_id] ??= []).push(r);
    }
    return out;
  }, [requests]);

  const sentCount = useMemo(
    () => requests.filter((r) => r.status === "submitted" || r.status === "accepted").length,
    [requests],
  );

  const overdueCount = useMemo(
    () => (cases ?? []).filter((c) => risk(c, today) === "overdue").length,
    [cases, today],
  );

  const nextDeadline = useMemo(
    () =>
      [...(cases ?? [])]
        .filter((c) => c.due_on)
        .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""))[0] ?? null,
    [cases],
  );

  const visible = useMemo(() => timeline(events, "client"), [events]);

  const stepLabels = [t.stepDocuments, t.stepProgress, t.stepReview, t.stepFiling, t.stepDone];

  /**
   * Upload a document. The file is stored and the request moves to
   * `submitted`, never to `accepted`. A click with no file changes nothing.
   */
  async function send(r: CaseRequest, file: File) {
    if (!ids) {
      setFailed(r.id);
      return;
    }
    setBusy(r.id);
    setFailed(null);
    const result = await submitRequestFile({
      requestId: r.id,
      file,
      taxpayerId: ids.taxpayerId,
      organizationId: ids.organizationId,
      caseId: r.case_id,
      label: locale === "fr" ? r.label_fr : r.label_en,
      actorLabel: clientName,
      previousStatus: r.status,
    });
    if (!result.ok) {
      setFailed(r.id);
    } else {
      setRequests((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: "submitted" as const } : x)),
      );
      void load();
    }
    setBusy(null);
  }

  const label = (r: CaseRequest) => (locale === "fr" ? r.label_fr : r.label_en);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">
            {t.welcome}, {clientName}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">{t.subtitle}</p>
        </div>
        {live && (
          <p className="inline-flex items-center gap-1.5 text-xs text-teal-text">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal" />
            {t.live}
          </p>
        )}
      </div>

      {offline && (
        <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text">
          {t.offline}
        </p>
      )}

      {cases === null ? (
        <div className="order-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-card bg-surface-sunken" />
          ))}
        </div>
      ) : (
        <div className="order-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label={t.activeServices} value={cases.length} tone="neutral" />
          <Tile
            label={t.actionRequired}
            value={owed.length}
            tone={owed.length > 0 ? "amber" : "teal"}
          />
          <Tile label={t.documentsShared} value={sentCount} tone="neutral" />
          <Tile label={t.overdue} value={overdueCount} tone={overdueCount > 0 ? "danger" : "teal"} />
        </div>
      )}

      <div className="order-1 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t.actionTitle} />
            <div className="p-4 sm:p-5">
              {owed.length === 0 ? (
                <div className="rounded-card border border-dashed border-border bg-surface-sunken p-5 text-center">
                  <p className="text-sm font-medium text-fg">{t.actionEmpty}</p>
                  <p className="mt-1 text-xs text-fg-subtle">{t.actionEmptyHint}</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {owed.map((r) => {
                    const late = r.due_on < today;
                    return (
                      <li
                        key={r.id}
                        className={`rounded-card border p-3 sm:p-4 ${
                          late
                            ? "border-danger-text/40 bg-danger-soft"
                            : "border-amber/50 bg-amber-soft"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-medium text-fg">{label(r)}</p>
                          <span
                            className={`tnum shrink-0 font-mono text-xs font-semibold ${
                              late ? "text-danger-text" : "text-amber-text"
                            }`}
                          >
                            {t.dueOn} {r.due_on}
                          </span>
                        </div>
                        {r.status === "returned" && (
                          <p className="mt-1 text-xs font-medium text-danger-text">{t.againHint}</p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              pending.current = r.id;
                              fileRef.current?.click();
                            }}
                            disabled={busy === r.id}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
                          >
                            {busy === r.id ? t.sending : t.send}
                          </button>
                          {r.case_id && (
                            <Link
                              href={`/${locale}/app/declarations/${r.case_id}`}
                              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-navy"
                            >
                              {t.openService}
                            </Link>
                          )}
                          <Link
                            href={documentsHref}
                            className="inline-flex min-h-[44px] items-center text-sm font-medium text-fg-muted underline-offset-2 hover:underline"
                          >
                            {t.openDocuments}
                          </Link>
                        </div>
                        {failed === r.id && (
                          <p className="mt-2 text-xs font-medium text-danger-text">
                            {t.sendFailed}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* The sentence that stops a green tick from meaning approval. */}
              <p className="mt-4 border-t border-border pt-3 text-xs leading-snug text-fg-subtle">
                {t.receivedNotAccepted}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.servicesTitle} />
            <div className="p-4 sm:p-5">
              {(cases ?? []).length === 0 ? (
                <p className="text-sm text-fg-subtle">{t.servicesEmpty}</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {(cases ?? []).map((c) => {
                    const reqs = byCase[c.id] ?? [];
                    const state = clientStatus(c, awaitingClient(reqs));
                    return (
                      <li
                        key={c.id}
                        className="rounded-card border border-border bg-surface p-3 sm:p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <Link
                            href={`/${locale}/app/declarations/${c.id}`}
                            className="font-medium text-fg underline-offset-2 hover:underline"
                          >
                            {obligationLabel(c.obligation_code, locale)}
                          </Link>
                          <span className="tnum font-mono text-xs text-fg-subtle">
                            {c.period_token}
                          </span>
                        </div>
                        <ProgressRail current={state} labels={stepLabels} />
                        {c.due_on && (
                          <p className="tnum mt-2 font-mono text-xs text-fg-subtle">
                            {t.dueOn} {c.due_on}
                            {c.due_needs_confirmation && (
                              <span className="ml-2 font-sans text-amber-text">{t.provisional}</span>
                            )}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t.nextDeadline} />
            <div className="p-4 sm:p-5">
              {!nextDeadline ? (
                <p className="text-sm text-fg-subtle">{t.noDeadline}</p>
              ) : (
                <>
                  <p className="font-display text-lg font-semibold text-fg">
                    {obligationLabel(nextDeadline.obligation_code, locale)}
                  </p>
                  <p className="tnum mt-1 font-mono text-sm text-fg-muted">{nextDeadline.due_on}</p>
                  {nextDeadline.due_needs_confirmation && (
                    <p className="mt-2 text-xs text-amber-text">{t.provisional}</p>
                  )}
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.updatesTitle} />
            <div className="p-4 sm:p-5">
              {visible.length === 0 ? (
                <p className="text-sm text-fg-subtle">{t.updatesEmpty}</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-3">
                    {visible.map((e) => (
                      <li
                        key={e.id}
                        className="border-b border-border/60 pb-3 last:border-0 last:pb-0"
                      >
                        <p className="text-sm leading-snug text-fg">{describe(e, locale)}</p>
                        <p className="tnum mt-1 font-mono text-xs text-fg-subtle">
                          {e.occurred_at.slice(0, 10)}
                          {e.actor_role !== "client" && e.actor_label && (
                            <span className="font-sans"> · {e.actor_label}</span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-border pt-3 text-xs leading-snug text-fg-subtle">
                    {t.updatesHint}
                  </p>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,.txt"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = pending.current;
          const req = requests.find((r) => r.id === id);
          if (file && req) void send(req, file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
