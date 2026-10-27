"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePortalCopy } from "@/components/client-portal/copy";
import {
  EmptyState,
  FilterBar,
  LoadingRows,
  OfflineNote,
  PageHeading,
  Pill,
  PrimaryButton,
  progressPercent,
} from "@/components/client-portal/ui";
import {
  awaitingClient,
  clientStatus,
  clientStatusLabel,
  obligationLabel,
  type CaseRequest,
  type ClientStatus,
  type ComplianceCase,
  type Engagement,
} from "@/lib/cases";
import { audit, demoIds, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";

type Filter = "all" | "active" | "action" | "done";

type CardModel = {
  id: string;
  href: string | null;
  title: string;
  period: string;
  deadline: string | null;
  provisional: boolean;
  status: ClientStatus | "not_started";
};

const CASE_COLUMNS =
  "id, taxpayer_id, engagement_id, obligation_code, period_token, due_on, due_needs_confirmation, due_basis, stage, owner, blocker, opened_at, closed_at, filing_status, filing_reference, filing_evidence_ref, filing_attempted_at, filing_verified_at, payment_evidence_status, billing_status, prepared_by, prepared_at, approved_by, approved_at, self_approved";

/**
 * One card per obligation, progress taken only from `clientStatus`.
 * Engagements with no case yet read as not started — there is no second workflow.
 */
export function ServicesBoard({ locale }: { locale: "fr" | "en" }) {
  const copy = usePortalCopy();
  const toast = useToast();
  const [cases, setCases] = useState<ComplianceCase[] | null>(null);
  const [requests, setRequests] = useState<CaseRequest[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState<{ taxpayerId: string; organizationId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const resolved = await demoIds();
      setIds(resolved);
      const [cs, rq, eng] = await Promise.all([
        db.from("compliance_cases").select(CASE_COLUMNS).order("due_on", { ascending: true }),
        db.from("document_requests").select("id, case_id, taxpayer_id, label_fr, label_en, status, responsible, due_on, returned_count"),
        db.from("engagements").select("id, taxpayer_id, status, service_code, scope_note, fee_xaf, assigned_to, authorized_at, accepted_at, revoked_at"),
      ]);
      if (cs.error) throw cs.error;
      setCases((cs.data ?? []) as ComplianceCase[]);
      setRequests((rq.data ?? []) as CaseRequest[]);
      setEngagements(eng.error ? [] : ((eng.data ?? []) as Engagement[]));
      setOffline(false);
    } catch {
      setOffline(true);
      setCases([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => {
    const byCase: Record<string, CaseRequest[]> = {};
    for (const r of requests) {
      if (!r.case_id) continue;
      (byCase[r.case_id] ??= []).push(r);
    }
    const out: CardModel[] = [];
    for (const focus of cases ?? []) {
      const status = clientStatus(focus, awaitingClient(byCase[focus.id] ?? []));
      out.push({
        id: focus.id,
        href: `/${locale}/app/declarations/${focus.id}`,
        title: obligationLabel(focus.obligation_code, locale),
        period: focus.period_token,
        deadline: focus.due_on,
        provisional: focus.due_needs_confirmation,
        status,
      });
    }
    const covered = new Set((cases ?? []).map((c) => c.engagement_id).filter(Boolean));
    for (const e of engagements) {
      if (e.revoked_at || covered.has(e.id)) continue;
      out.push({
        id: e.id,
        href: null,
        title: e.service_code ? obligationLabel(e.service_code, locale) : e.scope_note || copy.servicesTitle,
        period: "—",
        deadline: null,
        provisional: false,
        status: "not_started",
      });
    }
    return out;
  }, [cases, requests, engagements, locale, copy.servicesTitle]);

  const visible = cards.filter((c) => {
    if (filter === "action" && c.status !== "waiting_on_you") return false;
    if (filter === "done" && c.status !== "complete") return false;
    if (filter === "active" && (c.status === "complete" || c.status === "closed" || c.status === "not_started"))
      return false;
    if (q.trim() && !`${c.title} ${c.period}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  function badges(status: CardModel["status"]) {
    if (status === "not_started") return [{ label: copy.badgeNotStarted, tone: "muted" as const }];
    if (status === "waiting_on_you")
      return [
        { label: copy.badgeAction, tone: "amber" as const },
        { label: copy.badgeProgress, tone: "amber-outline" as const },
      ];
    if (status === "in_progress") return [{ label: copy.badgeActive, tone: "green-outline" as const }, { label: copy.badgeProgress, tone: "amber-outline" as const }];
    if (status === "in_review") return [{ label: copy.badgeReview, tone: "amber-outline" as const }];
    // Only `complete` earns the green "done" badge. A filing that nobody has
    // confirmed, or a file closed without finishing, is never shown as done.
    if (status === "complete") return [{ label: copy.badgeDone, tone: "green" as const }];
    if (status === "closed") return [{ label: clientStatusLabel(status, locale), tone: "muted" as const }];
    return [
      { label: copy.badgeFiling, tone: "amber-outline" as const },
      { label: clientStatusLabel(status, locale), tone: status === "filing_verified" ? ("green-outline" as const) : ("muted" as const) },
    ];
  }

  async function sendRequest() {
    const body = askText.trim();
    if (!body) {
      toast(copy.requestServiceNeedText, "error");
      return;
    }
    if (!ids) {
      toast(copy.offline, "error");
      return;
    }
    setBusy(true);
    try {
      const db = supabase();
      const { data: org } = await db.from("organizations").select("id").order("created_at").limit(1).maybeSingle();
      const organizationId = (org?.id as string | undefined) ?? ids.organizationId;
      const id = crypto.randomUUID();
      const { error } = await db.from("messages").insert({
        id,
        taxpayer_id: ids.taxpayerId,
        organization_id: organizationId,
        request_id: null,
        sender: "taxpayer",
        sender_name: copy.nav.services,
        body,
        read_at: null,
      });
      if (error) throw error;
      await audit({
        taxpayerId: ids.taxpayerId,
        organizationId,
        actor: "taxpayer",
        action: "message.sent",
        resourceType: "message",
        resourceId: id,
        after: { length: body.length, kind: "service_request" },
      });
      toast(copy.requestServiceSent);
      setAskText("");
      setAskOpen(false);
    } catch {
      toast(copy.requestServiceFailed, "error");
    } finally {
      setBusy(false);
    }
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: copy.filterAll },
    { id: "active", label: copy.filterActive },
    { id: "action", label: copy.filterAction },
    { id: "done", label: copy.filterDone },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={copy.servicesTitle}
        action={
          <PrimaryButton onClick={() => setAskOpen(true)}>{copy.requestService}</PrimaryButton>
        }
      />
      {offline && <OfflineNote>{copy.offline}</OfflineNote>}
      <div className="flex flex-wrap items-center gap-2">
        <FilterBar label={copy.servicesFilter} value={q} onChange={setQ} placeholder={copy.searchPlaceholder} />
        <div role="tablist" aria-label={copy.servicesFilter} className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-3 text-sm font-semibold ${
                filter === f.id ? "border-[#1B4E89] bg-[#1B4E89] text-white" : "border-border bg-white text-fg-muted hover:bg-surface-sunken"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {cases === null ? (
        <LoadingRows label={copy.loading} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={cards.length === 0 ? copy.servicesEmpty : copy.servicesNoMatch}
          hint={cards.length === 0 ? undefined : copy.servicesNoMatchHint}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map((card) => {
            const pct = card.status === "not_started" ? 0 : progressPercent(card.status);
            const inner = (
              <>
                <h2 className="font-display text-lg font-semibold text-fg">{card.title}</h2>
                <p className="mt-2 text-sm text-fg-muted">
                  {copy.period}: <span className="tnum">{card.period}</span>
                </p>
                <p className="text-sm text-fg-muted">
                  {copy.nextDeadline}:{" "}
                  <span className="tnum">{card.deadline ?? copy.noDeadline}</span>
                  {card.provisional && <span className="ml-2 text-amber-text">{copy.provisional}</span>}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {badges(card.status).map((b) => (
                    <Pill key={b.label} tone={b.tone}>
                      {b.label}
                    </Pill>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                    <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="tnum text-sm font-semibold text-fg-muted">{pct}%</span>
                </div>
              </>
            );
            return (
              <li key={card.id}>
                {card.href ? (
                  <Link href={card.href} className="block rounded-card border border-border bg-white p-5 shadow-card transition-shadow hover:shadow-raised focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-navy">
                    {inner}
                  </Link>
                ) : (
                  <article className="rounded-card border border-border bg-white p-5 shadow-card">{inner}</article>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {askOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="ask-title" className="w-full max-w-lg rounded-card bg-white p-5 shadow-raised">
            <h2 id="ask-title" className="font-display text-lg font-semibold text-fg">
              {copy.requestServiceTitle}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{copy.requestServiceHint}</p>
            <label className="mt-4 block text-sm font-medium text-fg">
              {copy.requestService}
              <textarea
                value={askText}
                onChange={(e) => setAskText(e.target.value)}
                rows={4}
                placeholder={copy.requestServicePlaceholder}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <PrimaryButton disabled={busy} onClick={() => void sendRequest()}>
                {busy ? copy.requestServiceSending : copy.requestServiceSend}
              </PrimaryButton>
              <button type="button" onClick={() => setAskOpen(false)} className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-sunken">
                {copy.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
