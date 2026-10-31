"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { sessionTaxpayerId, supabase } from "@/lib/supabase";
import { todayInDouala } from "@/lib/dates";
import { submitRequestFile } from "@/lib/submit-request";
import {
  awaitingClient,
  clientStatus,
  clientStep,
  clientStatusLabel,
  obligationLabel,
  requestIsOutstanding,
  requestStatusLabel,
  waitsOn,
  type CaseRequest,
  type ClientStatus,
  type ComplianceCase,
} from "@/lib/cases";
import { describe, timeline, type CaseEvent } from "@/lib/events";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { usePortalCopy } from "@/components/client-portal/copy";
import { PrimaryButton, StatusStepper } from "@/components/client-portal/ui";

/**
 * One obligation, in the client's five states.
 *
 * The boards draw the firm's stages on the client dashboard. This screen
 * does not. `clientStatus()` is the only progress vocabulary here. Filing
 * is described by its evidence reference, or as still awaiting proof.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>["clientService"];
type Dash = ReturnType<typeof getWorkspaceDictionary>["clientDash"];


const CASE_COLUMNS =
  "id, taxpayer_id, engagement_id, obligation_code, period_token, due_on, due_needs_confirmation, due_basis, stage, approval_round, organization_id, owner, blocker, opened_at, closed_at, filing_status, filing_reference, filing_evidence_ref, filing_attempted_at, filing_verified_at, payment_evidence_status, billing_status, prepared_by, prepared_at, approved_by, approved_at, self_approved";

export function ClientService({
  caseId,
  locale,
  t,
  dash,
  backHref,
}: {
  caseId: string;
  locale: "fr" | "en";
  t: Dict;
  dash: Dash;
  backHref: string;
}) {
  const [row, setRow] = useState<ComplianceCase | null | undefined>(undefined);
  // A reused route component must never render the previous case while loading a new caseId.
  const [loadedCaseId, setLoadedCaseId] = useState<string | null>(null);
  const [requests, setRequests] = useState<CaseRequest[]>([]);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // caseId can change before effects run. Stamp it during render so a busy
  // or failed approval from the previous case cannot disable the next one.
  const [caseStamp, setCaseStamp] = useState(caseId);
  const [ids, setIds] = useState<{ taxpayerId: string; organizationId: string } | null>(null);
  const [name, setName] = useState("");
  const [clientApproved, setClientApproved] = useState(false);
  const copy = usePortalCopy();
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);
  const loadEpoch = useRef(0);
  const authEpoch = useRef(0);
  const identityRef = useRef<string | null | undefined>(undefined);
  // Updated during render: route changes invalidate prior-case mutation completions
  // even before effect cleanup runs.
  const activeCaseId = useRef(caseId);
  activeCaseId.current = caseId;
  if (caseStamp !== caseId) {
    setCaseStamp(caseId);
    setBusy(null);
    setFailed(null);
    pending.current = null;
  }
  const today = todayInDouala();

  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    try {
      const db = supabase();
      const taxpayerId = await sessionTaxpayerId();
      if (epoch !== loadEpoch.current) return;
      if (!taxpayerId) throw new Error("Authenticated taxpayer required");
      const { data, error } = await db
        .from("compliance_cases")
        .select(CASE_COLUMNS)
        .eq("id", caseId)
        .eq("taxpayer_id", taxpayerId)
        .maybeSingle();
      if (epoch !== loadEpoch.current) return;
      if (error) throw error;
      if (!data) {
        setRow(null);
        setIds(null);
        setRequests([]);
        setEvents([]);
        setName("");
        setClientApproved(false);
        setLoadedCaseId(caseId);
        setOffline(false);
        return;
      }
      const kase = data as ComplianceCase & { organization_id: string | null };
      if (!kase.engagement_id || !kase.organization_id) throw new Error("Missing case engagement");
      const { data: grant, error: grantError } = await db.from("engagements")
        .select("organization_id,taxpayer_id,status,accepted_at,authorized_at,revoked_at")
        .eq("id", kase.engagement_id)
        .eq("taxpayer_id", taxpayerId)
        .maybeSingle();
      if (epoch !== loadEpoch.current) return;
      if (grantError || !grant || grant.organization_id !== kase.organization_id ||
          grant.revoked_at || !["accepted","authorized"].includes(grant.status) ||
          !(grant.accepted_at || grant.authorized_at)) {
        throw new Error("Case engagement not active");
      }
      const [rq, ev, tp, consent] = await Promise.all([
        db
          .from("document_requests")
          .select("id, case_id, taxpayer_id, label_fr, label_en, status, responsible, due_on, returned_count")
          .eq("case_id", caseId)
          .eq("taxpayer_id", taxpayerId)
          .eq("organization_id", grant.organization_id)
          .order("due_on"),
        db
          .from("case_events")
          .select(
            "id, case_id, occurred_at, dimension, kind, actor_role, actor_label, from_value, to_value, subject_ref, reason, visibility",
          )
          .eq("case_id", caseId)
          .order("occurred_at", { ascending: false }),
        db.from("taxpayers").select("legal_name").eq("id", kase.taxpayer_id).maybeSingle(),
        db.from("case_client_approvals").select("case_id")
          .eq("case_id", caseId).eq("approval_round", kase.approval_round)
          .maybeSingle(),
      ]);
      if (epoch !== loadEpoch.current) return;
      if (rq.error || ev.error || tp.error || consent.error) {
        throw rq.error ?? ev.error ?? tp.error ?? consent.error;
      }
      setIds({ taxpayerId, organizationId: grant.organization_id });
      setRow(kase);
      setClientApproved(Boolean(consent.data));
      setRequests((rq.data ?? []) as CaseRequest[]);
      setEvents((ev.data ?? []) as CaseEvent[]);
      setName((tp.data as { legal_name?: string } | null)?.legal_name ?? "");
      setLoadedCaseId(caseId);
      setOffline(false);
    } catch {
      if (epoch !== loadEpoch.current) return;
      // Fail closed: no prior-account case, consent, or request survives a failed read.
      setOffline(true);
      setRow(null);
      setIds(null);
      setRequests([]);
      setEvents([]);
      setName("");
      setClientApproved(false);
      setLoadedCaseId(caseId);
    }
  }, [caseId]);

  useEffect(() => {
    void supabase().auth.getUser().then(({ data }) => {
      if (identityRef.current === undefined) identityRef.current = data.user?.id ?? null;
    });
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = supabase().auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      const nextUserId = event === "SIGNED_OUT" ? null : session?.user?.id ?? null;
      if (nextUserId === identityRef.current) return;
      identityRef.current = nextUserId;
      ++authEpoch.current;
      ++loadEpoch.current;
      // Clear the previous identity's approval and case before reloading.
      setLoadedCaseId(null);
      setRow(undefined);
      setIds(null);
      setRequests([]);
      setEvents([]);
      setName("");
      setClientApproved(false);
      setOffline(false);
      setBusy(null);
      setFailed(null);
      pending.current = null;
      if (fileRef.current) fileRef.current.value = "";
      if (timer) clearTimeout(timer);
      // Avoid awaiting Supabase requests inside the auth callback.
      timer = setTimeout(() => { void load(); }, 0);
    });
    return () => {
      ++authEpoch.current;
      ++loadEpoch.current;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [load]);

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
    try {
      channel = supabase()
        .channel(`client-service-${caseId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "document_requests" }, () => void load())
        .on("postgres_changes", { event: "*", schema: "public", table: "compliance_cases" }, () => void load())
        .on("postgres_changes", { event: "*", schema: "public", table: "case_events" }, () => void load())
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      if (channel) void channel.unsubscribe();
    };
  }, [caseId, load]);

  const status = row ? clientStatus(row, awaitingClient(requests)) : null;
  const visible = useMemo(() => timeline(events, "client"), [events]);

  async function upload(requestId: string, file: File) {
    const req = requests.find((r) => r.id === requestId);
    if (!req || !ids || !row) return;
    // A file chooser opened on another case must not submit to that previous case.
    if (loadedCaseId !== caseId || row.id !== caseId || req.case_id !== caseId) return;
    if (!(requestIsOutstanding(req.status) && waitsOn(req) === "client")) return;
    const epoch = authEpoch.current;
    const actionCaseId = caseId;
    setBusy(requestId);
    setFailed(null);
    const result = await submitRequestFile({
      requestId,
      file,
      taxpayerId: ids.taxpayerId,
      organizationId: ids.organizationId,
      caseId: row.id,
      label: locale === "fr" ? req.label_fr : req.label_en,
      actorLabel: name || "Client",
      previousStatus: req.status,
    });
    if (epoch !== authEpoch.current || actionCaseId !== activeCaseId.current) return;
    setBusy(null);
    if (!result.ok) {
      setFailed(requestId);
      return;
    }
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "submitted" } : r)));
    void load();
  }

  async function approveCase() {
    if (!row || !ids || row.stage !== "client_approval" || clientApproved) return;
    // Client consent must not be offered for unverified or missing filing evidence.
    if (row.filing_status !== "verified" || !row.filing_evidence_ref?.trim()) return;
    // Do not initiate consent from a stale case while the route is changing.
    if (loadedCaseId !== caseId || row.id !== caseId) return;
    const epoch = authEpoch.current;
    const actionCaseId = caseId;
    setBusy("client-approval");
    setFailed(null);
    const db = supabase();
    try {
      const { data: auth, error: authError } = await db.auth.getUser();
      if (epoch !== authEpoch.current || actionCaseId !== activeCaseId.current) return;
      if (authError || !auth.user) throw new Error("Sign-in required");
      const { error } = await db.from("case_client_approvals").insert({
        case_id: row.id, approval_round: row.approval_round,
        taxpayer_id: ids.taxpayerId, filing_evidence_ref: row.filing_evidence_ref,
        approved_by: auth.user.id,
      });
      if (epoch !== authEpoch.current || actionCaseId !== activeCaseId.current) return;
      if (error) throw error;
      setClientApproved(true);
      await load();
    } catch {
      if (epoch === authEpoch.current && actionCaseId === activeCaseId.current) setFailed("client-approval");
    } finally {
      if (epoch === authEpoch.current && actionCaseId === activeCaseId.current) setBusy(null);
    }
  }

  // React can reuse this component for a different caseId before effects run.
  // Do not show the previous case or its approval action during that render.
  if (row === undefined || loadedCaseId !== caseId) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton h-24 rounded-card" />
        ))}
      </div>
    );
  }

  if (!row || !status) {
    return (
      <div className="rounded-card border border-border bg-surface p-5">
        <p className="text-sm text-fg-muted">{offline ? t.offline : t.notFound}</p>
        <Link href={backHref} className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-navy">
          {t.back}
        </Link>
      </div>
    );
  }

  const hasVerifiedEvidence = row.filing_status === "verified" && Boolean(row.filing_evidence_ref?.trim());
  const at = clientStep(status);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={backHref} className="text-sm font-semibold text-navy">
          {t.back}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold text-fg">
            {obligationLabel(row.obligation_code, locale)}
          </h1>
          <span className="tnum font-mono text-xs text-fg-subtle">{row.period_token}</span>
        </div>
        <p className="mt-1 text-sm font-medium text-fg">{clientStatusLabel(status, locale)}</p>
      </div>

      <StatusStepper
        title={row.period_token}
        labels={[
          copy.steps.documents,
          copy.steps.preparation,
          copy.steps.review,
          copy.steps.filing,
          copy.steps.completed,
        ]}
        current={at}
      />

      {row.due_on && (
        <p className={`tnum font-mono text-sm ${row.due_on < today ? "text-danger-text" : "text-fg-muted"}`}>
          {dash.dueOn} {row.due_on}
          {row.due_needs_confirmation && (
            <span className="ml-2 font-sans text-xs font-semibold text-amber-text">{dash.provisional}</span>
          )}
        </p>
      )}

      <section className="rounded-card border border-border bg-surface">
        <h3 className="border-b border-border px-4 py-3 font-display text-base font-semibold">{t.evidence}</h3>
        <div className="px-4 py-4">
          {row.filing_evidence_ref ? (
            <p className="text-sm text-fg">
              <code className="tnum rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs">
                {row.filing_evidence_ref}
              </code>
            </p>
          ) : (
            <p className="text-sm text-amber-text">{t.noEvidence}</p>
          )}
          <p className="mt-2 text-xs leading-snug text-fg-subtle">{t.notAFiling}</p>
        </div>
      </section>

      {row.stage === "client_approval" && (
        <section className="rounded-card border border-border bg-surface px-4 py-4">
          <h3 className="font-display text-base font-semibold">
            {locale === "fr" ? "Validation du client" : "Client approval"}
          </h3>
          <p className="mt-2 text-sm text-fg-muted">
            {clientApproved
              ? (locale === "fr" ? "Validation enregistrée pour ce dépôt." : "Approval recorded for this filing.")
              : (locale === "fr"
                ? "Vérifiez la preuve de dépôt ci-dessus avant de confirmer."
                : "Review the filing evidence above before confirming.")}
          </p>
          {!clientApproved && !hasVerifiedEvidence && (
            <p role="status" className="mt-3 text-sm text-amber-text">
              {locale === "fr"
                ? "Validation indisponible tant que le dépôt et sa preuve ne sont pas vérifiés."
                : "Approval is unavailable until the filing and its evidence are verified."}
            </p>
          )}
          {!clientApproved && hasVerifiedEvidence && <div className="mt-3">
            <PrimaryButton onClick={() => void approveCase()} disabled={busy === "client-approval"}>
              {locale === "fr" ? "Confirmer la validation" : "Confirm approval"}
            </PrimaryButton>
          </div>}
          {failed === "client-approval" && <p role="alert" className="mt-2 text-sm text-danger-text">
            {locale === "fr" ? "Validation refusée. Vérifiez votre session et réessayez." : "Approval refused. Check your session and try again."}
          </p>}
        </section>
      )}

      <section className="rounded-card border border-border bg-surface">
        <h3 className="border-b border-border px-4 py-3 font-display text-base font-semibold">{t.requests}</h3>
        {requests.length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg-muted">{t.noRequests}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {requests.map((r) => {
              const label = locale === "fr" ? r.label_fr : r.label_en;
              const mine = requestIsOutstanding(r.status) && waitsOn(r) === "client";
              const accepted = r.status === "accepted";
              const received = r.status === "submitted";
              const late = mine && r.due_on < today;
              return (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-fg">{label}</p>
                      <p className="text-xs text-fg-subtle">
                        {mine ? t.withYou : t.withFirm} · {requestStatusLabel(r.status, locale)}
                        {r.returned_count > 0 ? ` · ${r.returned_count} ${t.returnedTimes}` : ""}
                      </p>
                    </div>
                    <span className={`tnum font-mono text-xs ${late ? "font-semibold text-danger-text" : "text-fg-subtle"}`}>
                      {r.due_on}
                    </span>
                  </div>
                  {received && <p className="text-xs text-fg-muted">{t.receivedNotAccepted}</p>}
                  {accepted && (
                    <p className="text-xs font-medium text-success-text">{requestStatusLabel("accepted", locale)}</p>
                  )}
                  {mine && (
                    <PrimaryButton
                      disabled={busy === r.id}
                      onClick={() => {
                        pending.current = r.id;
                        fileRef.current?.click();
                      }}
                    >
                      {busy === r.id ? t.uploading : t.upload}
                    </PrimaryButton>
                  )}
                  {failed === r.id && <p className="text-xs font-medium text-danger-text">{t.failed}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-border bg-surface">
        <h3 className="border-b border-border px-4 py-3 font-display text-base font-semibold">{t.history}</h3>
        {visible.length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg-muted">{t.historyEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {visible.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <p className="text-sm text-fg">{describe(e, locale)}</p>
                <p className="tnum mt-1 font-mono text-xs text-fg-subtle">{e.occurred_at.slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,.txt"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = pending.current;
          if (file && id) void upload(id, file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
