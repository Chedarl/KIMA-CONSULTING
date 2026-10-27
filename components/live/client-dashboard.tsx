"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { demoIds, supabase } from "@/lib/supabase";
import { submitRequestFile } from "@/lib/submit-request";
import { todayInDouala } from "@/lib/dates";
import { usePortalCopy } from "@/components/client-portal/copy";
import { Pill, PrimaryButton, StatusStepper } from "@/components/client-portal/ui";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  awaitingClient,
  clientStatus,
  clientStep,
  obligationLabel,
  requestIsOutstanding,
  risk,
  waitsOn,
  type CaseRequest,
  type ClientStatus,
  type ComplianceCase,
} from "@/lib/cases";

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


const todayISO = () => todayInDouala();

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
  const [offline, setOffline] = useState(false);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [justSent, setJustSent] = useState<string | null>(null);
  const copy = usePortalCopy();
  const [ids, setIds] = useState<{ taxpayerId: string; organizationId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      setIds(await demoIds());
      const [cs, rq, tp] = await Promise.all([
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
        db.from("taxpayers").select("legal_name").limit(1),
      ]);
      if (cs.error) throw cs.error;
      const who = (tp.data ?? [])[0] as { legal_name?: string } | undefined;
      if (who?.legal_name) setClientName(who.legal_name);
      setCases((cs.data ?? []) as ComplianceCase[]);
      setRequests((rq.data ?? []) as CaseRequest[]);
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

  const stepLabels = [
    copy.steps.documents,
    copy.steps.preparation,
    copy.steps.review,
    copy.steps.filing,
    copy.steps.completed,
  ];

  const featured = useMemo(() => {
    const open = (cases ?? []).filter((c) => !c.closed_at);
    return (
      [...open].sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"))[0] ?? null
    );
  }, [cases]);

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
      setJustSent(locale === "fr" ? r.label_fr : r.label_en);
      setRequests((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: "submitted" as const } : x)),
      );
      void load();
    }
    setBusy(null);
  }

  const label = (r: CaseRequest) => (locale === "fr" ? r.label_fr : r.label_en);

  const primary = owed[0] ?? null;
  const featuredStatus = featured
    ? clientStatus(featured, awaitingClient(byCase[featured.id] ?? []))
    : null;

  const tiles = [
    {
      href: `/${locale}/app/services`,
      value: cases?.length ?? 0,
      label: (cases?.length ?? 0) === 1 ? copy.activeOne : copy.activeMany,
      valueClass: "text-fg",
    },
    {
      href: `/${locale}/app/requests`,
      value: owed.length,
      label: copy.pending,
      valueClass: "text-teal-text",
    },
    {
      href: documentsHref,
      value: sentCount,
      label: copy.shared,
      valueClass: "text-teal",
    },
    {
      href: `/${locale}/app/calendar`,
      value: overdueCount,
      label: copy.overdue,
      valueClass: "text-danger-text",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-fg">
            {copy.welcome}, {clientName}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">{copy.overview}</p>
        </div>
        {live && (
          <p className="inline-flex items-center gap-1.5 text-xs text-teal-text">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal" />
            {copy.live}
          </p>
        )}
      </div>

      {offline && (
        <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text" role="status">
          {copy.offline}
        </p>
      )}

      {justSent && (
        <p className="rounded-card border border-teal/40 bg-teal-soft px-4 py-3 text-sm text-teal-text" role="status">
          {justSent} — {t.sent}
        </p>
      )}

      {cases === null ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-card bg-white" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              href={tile.href}
              className="rounded-card border border-border bg-white p-5 shadow-card transition-shadow hover:shadow-raised focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              <p className={`tnum font-display text-3xl font-semibold leading-none ${tile.valueClass}`}>{tile.value}</p>
              <p className="mt-2 text-sm text-fg-muted">{tile.label}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section
          className={`rounded-card border p-5 shadow-card ${
            primary ? "border-amber/40 bg-[#FFF8EC]" : "border-border bg-white"
          }`}
        >
          {primary ? (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-text">
                <WarningIcon />
                {copy.actionNeeded}
              </p>
              <h2 className="mt-2 font-display text-lg font-semibold text-fg">{label(primary)}</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {t.dueOn} {primary.due_on}
                {primary.status === "returned" ? ` — ${t.againHint}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <PrimaryButton
                  disabled={busy === primary.id}
                  onClick={() => {
                    pending.current = primary.id;
                    fileRef.current?.click();
                  }}
                >
                  {busy === primary.id ? copy.uploading : copy.upload}
                </PrimaryButton>
                {owed.length > 1 && (
                  <Link href={`/${locale}/app/requests`} className="text-sm font-semibold text-navy hover:underline">
                    {owed.length - 1} {copy.moreActions}
                  </Link>
                )}
              </div>
              {failed === primary.id && <p className="mt-2 text-xs font-medium text-danger-text">{t.sendFailed}</p>}
              <p className="mt-4 text-xs text-fg-subtle">{t.receivedNotAccepted}</p>
            </>
          ) : (
            <>
              <h2 className="font-display text-base font-semibold text-fg">{copy.noAction}</h2>
              <p className="mt-1 text-sm text-fg-muted">{copy.noActionHint}</p>
              <Link href={documentsHref} className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text hover:underline">
                {t.openDocuments}
              </Link>
            </>
          )}
        </section>

        <section className="rounded-card border border-border bg-white p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-fg">{copy.currentServices}</h2>
            <Link href={`/${locale}/app/services`} className="text-sm font-semibold text-[#1B4E89] hover:underline">
              {copy.viewAll} →
            </Link>
          </div>
          {(cases ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-fg-muted">{copy.servicesEmpty}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {(cases ?? []).slice(0, 4).map((c) => {
                const state = clientStatus(c, awaitingClient(byCase[c.id] ?? []));
                return (
                  <li key={c.id}>
                    <Link
                      href={`/${locale}/app/declarations/${c.id}`}
                      className="flex min-h-[44px] items-center justify-between gap-3 py-2 hover:text-teal-text"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{obligationLabel(c.obligation_code, locale)}</span>
                        <span className="tnum block font-mono text-xs text-fg-subtle">{c.period_token}</span>
                      </span>
                      <Pill tone={state === "waiting_on_you" ? "amber" : state === "complete" ? "green" : "muted"}>
                        {state === "waiting_on_you" ? copy.badgeAction : state === "complete" ? copy.badgeDone : copy.badgeActive}
                      </Pill>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {featured && featuredStatus ? (
        <div>
          <StatusStepper
            title={`${obligationLabel(featured.obligation_code, locale)} (${featured.period_token})`}
            labels={stepLabels}
            current={clientStep(featuredStatus)}
          />
          {featured.due_needs_confirmation && (
            <p className="mt-2 text-xs text-amber-text">{copy.provisional}</p>
          )}
        </div>
      ) : (
        cases !== null && <p className="text-sm text-fg-muted">{copy.noDeclaration}</p>
      )}

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

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 4 3 19h18z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}
