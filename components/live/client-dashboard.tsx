"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { demoIds, supabase } from "@/lib/supabase";
import { submitRequestFile } from "@/lib/submit-request";
import { todayInDouala } from "@/lib/dates";
import { usePortalCopy } from "@/components/client-portal/copy";
import { Pill, PrimaryButton, StatusStepper } from "@/components/client-portal/ui";
import { ActionQueue } from "@/components/client-portal/action-queue";
import { SectionHeading } from "@/components/ui/section-heading";
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
  const [noClient, setNoClient] = useState(false);
  const [offline, setOffline] = useState(false);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [justSent, setJustSent] = useState<string | null>(null);
  const copy = usePortalCopy();
  const [ids, setIds] = useState<{ taxpayerId: string; organizationId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);
  const loadEpoch = useRef(0);
  const authEpoch = useRef(0);
  const identityRef = useRef<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    try {
      const db = supabase();
      const resolved = await demoIds();
      if (epoch !== loadEpoch.current) return;
      setIds(resolved);
      if (!resolved) {
        setNoClient(true);
        setClientName(fallbackName);
        setCases([]);
        setRequests([]);
        setOffline(true);
        return;
      }
      const [cs, rq, tp] = await Promise.all([
        db
          .from("compliance_cases")
          .select(
            "id, taxpayer_id, engagement_id, obligation_code, period_token, due_on, due_needs_confirmation, due_basis, stage, owner, blocker, opened_at, closed_at, filing_status, filing_reference, filing_evidence_ref, filing_attempted_at, filing_verified_at, payment_evidence_status, billing_status, prepared_by, prepared_at, approved_by, approved_at, self_approved",
          )
          .eq("taxpayer_id", resolved.taxpayerId)
          .eq("organization_id", resolved.organizationId)
          .is("closed_at", null),
        db
          .from("document_requests")
          .select(
            "id, case_id, taxpayer_id, label_fr, label_en, status, responsible, due_on, returned_count",
          )
          .eq("taxpayer_id", resolved.taxpayerId)
          .eq("organization_id", resolved.organizationId),
        db.from("taxpayers").select("legal_name").eq("id", resolved.taxpayerId).maybeSingle(),
      ]);
      if (epoch !== loadEpoch.current) return;
      if (cs.error || rq.error || tp.error) throw cs.error ?? rq.error ?? tp.error;
      const who = tp.data as { legal_name?: string } | null;
      setClientName(who?.legal_name ?? fallbackName);
      setCases((cs.data ?? []) as ComplianceCase[]);
      setRequests((rq.data ?? []) as CaseRequest[]);
      setOffline(false);
      setNoClient(false);
    } catch {
      if (epoch !== loadEpoch.current) return;
      setIds(null);
      setClientName(fallbackName);
      setOffline(true);
      setCases([]);
      setRequests([]);
    }
  }, [fallbackName]);

  useEffect(() => {
    void supabase().auth.getUser().then(({ data }) => {
      if (identityRef.current === undefined) identityRef.current = data.user?.id ?? null;
    });
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = supabase().auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      // Refreshes must not invalidate uploads, approvals or active selections.
      // SIGNED_IN may also fire for the same user: compare stable user IDs.
      const nextUserId = event === "SIGNED_OUT" ? null : session?.user?.id ?? null;
      if (nextUserId === identityRef.current) return;
      identityRef.current = nextUserId;
      // Clear the previous account immediately, before any asynchronous reload.
      ++authEpoch.current;
      ++loadEpoch.current;
      setIds(null);
      setClientName(fallbackName);
      setCases(null);
      setRequests([]);
      setOffline(false);
      setLive(false);
      setBusy(null);
      setFailed(null);
      setJustSent(null);
      pending.current = null;
      if (fileRef.current) fileRef.current.value = "";
      if (timer) clearTimeout(timer);
      // Supabase requests must run outside the auth callback.
      timer = setTimeout(() => { void load(); }, 0);
    });

    return () => {
      ++authEpoch.current;
      ++loadEpoch.current;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [fallbackName, load]);

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
    const epoch = authEpoch.current;
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
    if (epoch !== authEpoch.current) return; // Ignore a previous account's upload completion.
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

  const dueSoon = (cases ?? []).filter((c) => {
    if (!c.due_on) return false;
    const d = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 30);
    return c.due_on >= new Date().toISOString().slice(0, 10) && c.due_on <= d.toISOString().slice(0, 10);
  }).length;

  const tiles = [
    { href: `/${locale}/app/requests`, value: owed.length, label: copy.requests, hint: copy.pending, icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11", valueClass: "text-teal-text" },
    { href: `/${locale}/app/services`, value: overdueCount, label: copy.tasks, hint: copy.overdue, icon: "M12 8v4l3 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z", valueClass: "text-danger-text" },
    { href: `/${locale}/app/compliance`, value: dueSoon, label: copy.obligations, hint: copy.dueSoon, icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", valueClass: "text-fg" },
    { href: documentsHref, value: sentCount, label: copy.documents, hint: copy.shared, icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6", valueClass: "text-success-text" },
  ];

  if (noClient) {
    return (
      <section className="max-w-2xl rounded-card border border-border bg-white p-6 shadow-card">
        <h1 className="font-display text-xl font-semibold text-fg">
          {locale === "fr" ? "Espace client" : "Client portal"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {locale === "fr"
            ? "Aucun accès client n'est rattaché à ce compte. Un cabinet invite le contribuable avant que ses dossiers apparaissent ici."
            : "No client access is linked to this account. A firm invites the taxpayer before their cases appear here."}
        </p>
        <a
          href={locale === "fr" ? "/fr/workspace" : "/en/workspace"}
          className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90"
        >
          {locale === "fr" ? "Ouvrir l'espace cabinet" : "Open the firm workspace"}
        </a>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-fg">
            {copy.welcome}{clientName ? `, ${clientName}` : ""}
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
        <p className="rounded-card border border-success/40 bg-success-soft px-4 py-3 text-sm text-success-text" role="status">
          {justSent} — {t.sent}
        </p>
      )}

      {/*
        À traiter — the queue, first and dominant.
        The reference portals all answer one question here: what does my firm
        need from me. Grouped by kind with a count per group, because a flat
        list of every outstanding item reads as noise. It reads the four tables
        a client actually owes against, not only their cases.
      */}
      <section>
        <SectionHeading>{copy.requests}</SectionHeading>
        <div className="mt-3">
          <ActionQueue
            locale={locale}
            taxpayerId={ids?.taxpayerId ?? null}
            t={{
              empty: copy.statusCompleted,
              emptyHint: copy.overview,
              offline: copy.offline,
              loading: copy.loading,
              seeAll: copy.nav.dashboard,
              groups: {
                documents: copy.nav.documents,
                tasks: copy.tasks,
                messages: copy.nav.messages,
                invoices: copy.nav.payments,
              },
              open: copy.tasks,
              returned: copy.returned,
              unpaid: copy.nav.payments,
              unread: copy.unread,
              toSend: copy.upload,
            }}
          />
        </div>
      </section>

      {/* Quick actions — the four questions, one tap away. */}
      <nav aria-label={copy.overview} className="grid gap-3 sm:grid-cols-3">
        <Link href={`/${locale}/app/requests`} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#18243B] px-4 text-sm font-semibold text-white hover:bg-[#24314d]">{copy.quickUpload}</Link>
        <Link href={`/${locale}/app/messages`} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken">{copy.quickMessage}</Link>
        <Link href={`/${locale}/app/declarations`} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken">{copy.quickInvoices}</Link>
      </nav>

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
              className="flex items-start gap-3 rounded-card border border-border bg-white p-4 shadow-card transition-shadow hover:shadow-raised"
            >
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-teal-text">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={tile.icon} /></svg>
              </span>
              <span className="min-w-0">
                <span className={`tnum block font-display text-2xl font-semibold leading-none ${tile.valueClass}`}>{tile.value}</span>
                <span className="mt-1 block truncate text-sm text-fg-muted">{tile.label}</span>
                <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">{tile.hint}</span>
              </span>
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
          {owed.length > 0 ? (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-text">
                <WarningIcon />
                {copy.actionsTitle} · {owed.length}
              </p>
              <ul className="mt-3 divide-y divide-border">
                {owed.slice(0, 5).map((r) => {
                  const late = r.due_on && r.due_on < today;
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{label(r)}</span>
                        <span className={`tnum font-mono text-[11px] ${late ? "text-danger-text" : "text-fg-subtle"}`}>
                          {copy.actionDue} {r.due_on}
                          {r.status === "returned" ? ` — ${t.againHint}` : ""}
                        </span>
                      </span>
                      <PrimaryButton
                        disabled={busy === r.id}
                        onClick={() => {
                          pending.current = r.id;
                          fileRef.current?.click();
                        }}
                      >
                        {busy === r.id ? copy.uploading : copy.upload}
                      </PrimaryButton>
                    </li>
                  );
                })}
              </ul>
              {owed.length > 5 && (
                <Link href={`/${locale}/app/requests`} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-navy hover:underline">
                  {owed.length - 5} {copy.moreActions}
                </Link>
              )}
              {failed && <p className="mt-2 text-xs font-medium text-danger-text">{t.sendFailed}</p>}
              <p className="mt-3 text-xs text-fg-subtle">{t.receivedNotAccepted}</p>
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
                const stepIndex =
                  c.stage === "documents" ? 0
                    : c.stage === "accounting" || c.stage === "preparation" ? 1
                    : c.stage === "review" ? 2
                    : c.stage === "filing" || c.stage === "evidence" ? 3
                    : 4;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/${locale}/app/declarations/${c.id}`}
                      className="flex min-h-[44px] items-center justify-between gap-3 py-2 hover:text-teal-text"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{obligationLabel(c.obligation_code, locale)}</span>
                        <span className="tnum block font-mono text-xs text-fg-subtle">{c.period_token}</span>
                        <span className="mt-1 flex items-center gap-1" aria-label={copy.progressLabel}>
                          {stepLabels.map((s, k) => (
                            <span
                              key={s}
                              className={`h-1.5 w-4 rounded-full ${k <= stepIndex ? "bg-teal-text" : "bg-border"}`}
                              aria-hidden
                            />
                          ))}
                        </span>
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

      {/* C5: the four axes decide the obligations. Ask once, plainly. */}
      <section className="rounded-card border border-border bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-fg">{copy.detailsTitle}</h2>
            <p className="mt-1 max-w-2xl text-sm text-fg-muted">{copy.detailsBody}</p>
          </div>
          <Link
            href={`/${locale}/app/profile`}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken"
          >
            {copy.detailsCta}
          </Link>
        </div>
      </section>
      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-fg">{copy.contactTitle}</h2>
            <p className="mt-1 max-w-2xl text-sm text-fg-muted">{copy.contactBody}</p>
          </div>
          <Link
            href={`/${locale}/app/messages`}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken"
          >
            {copy.contactCta}
          </Link>
        </div>
      </section>


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

