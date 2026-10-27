"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePortalCopy } from "@/components/client-portal/copy";
import { EmptyState, FilterBar, LoadingRows, OfflineNote, PageHeading, Pill, PrimaryButton } from "@/components/client-portal/ui";
import { obligationLabel, requestIsOutstanding, waitsOn, type ComplianceCase } from "@/lib/cases";
import { sessionTaxpayerId, supabase, type DocumentRequestRow } from "@/lib/supabase";
import { submitRequestFile } from "@/lib/submit-request";
import { useToast } from "@/components/toast";
import { formatDay } from "@/components/client-portal/ui";

type Filter = "all" | "open" | "waiting" | "completed";

export function RequestsBoard({ locale }: { locale: "fr" | "en" }) {
  const copy = usePortalCopy();
  const toast = useToast();
  const [rows, setRows] = useState<DocumentRequestRow[] | null>(null);
  const [cases, setCases] = useState<Pick<ComplianceCase, "id" | "obligation_code" | "period_token">[]>([]);
  const [name, setName] = useState("");
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [ids, setIds] = useState<{ taxpayerId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      // The session's own taxpayer — never the oldest rows (demoIds). Uploads
      // below are filed against it, under each request's own firm.
      const taxpayerId = await sessionTaxpayerId();
      const resolved = taxpayerId ? { taxpayerId } : null;
      if (!resolved) {
        setOffline(true);
        setRows([]);
        return;
      }
      setIds(resolved);
      const [rq, cs, tp] = await Promise.all([
        db.from("document_requests").select("*").eq("taxpayer_id", resolved.taxpayerId).order("due_on"),
        db.from("compliance_cases").select("id, obligation_code, period_token").eq("taxpayer_id", resolved.taxpayerId),
        db.from("taxpayers").select("legal_name").eq("id", resolved.taxpayerId).maybeSingle(),
      ]);
      setRows((rq.data ?? []) as DocumentRequestRow[]);
      setCases((cs.data ?? []) as Pick<ComplianceCase, "id" | "obligation_code" | "period_token">[]);
      setName((tp.data as { legal_name?: string } | null)?.legal_name ?? "");
      setOffline(false);
    } catch {
      setOffline(true);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bucket = (r: DocumentRequestRow): Filter => {
    if (r.status === "accepted") return "completed";
    if (requestIsOutstanding(r.status) && waitsOn(r) === "client") return "open";
    return "waiting";
  };

  const visible = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (filter !== "all" && bucket(r) !== filter) return false;
      const label = locale === "fr" ? r.label_fr : r.label_en;
      if (q.trim() && !label.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, filter, q, locale]);

  async function send(id: string, file: File) {
    const req = rows?.find((r) => r.id === id);
    // A request is filed under its own taxpayer and firm. One that is not this
    // session's taxpayer is not ours to answer.
    if (!req || !ids || req.taxpayer_id !== ids.taxpayerId) return;
    if (!(requestIsOutstanding(req.status) && waitsOn(req) === "client")) return;
    setBusy(id);
    const result = await submitRequestFile({
      requestId: id,
      file,
      taxpayerId: ids.taxpayerId,
      organizationId: req.organization_id,
      caseId: req.case_id ?? null,
      label: locale === "fr" ? req.label_fr : req.label_en,
      actorLabel: name || "Client",
      previousStatus: req.status,
    });
    setBusy(null);
    if (!result.ok) {
      toast(copy.requestServiceFailed, "error");
      return;
    }
    toast(`${copy.statusReceived} — ${locale === "fr" ? req.label_fr : req.label_en}`);
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, status: "submitted" } : r)) ?? prev);
    void load();
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: copy.filterAll },
    { id: "open", label: copy.statusOpen },
    { id: "waiting", label: copy.statusWaiting },
    { id: "completed", label: copy.statusCompleted },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={copy.requestsTitle} subtitle={copy.receivedNotSame} />
      {offline && <OfflineNote>{copy.offline}</OfflineNote>}
      <div className="flex flex-wrap items-center gap-2">
        <FilterBar label={copy.searchDocs} value={q} onChange={setQ} placeholder={copy.searchPlaceholder} />
        <div role="tablist" aria-label={copy.requestsTitle} className="flex flex-wrap gap-2">
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

      {rows === null ? (
        <LoadingRows label={copy.loading} />
      ) : visible.length === 0 ? (
        <EmptyState title={rows.length === 0 ? copy.noRequests : copy.requestsNoMatch} hint={rows.length === 0 ? copy.noRequestsHint : copy.servicesNoMatchHint} />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((r) => {
            const kind = bucket(r);
            const label = locale === "fr" ? r.label_fr : r.label_en;
            const kase = cases.find((c) => c.id === r.case_id);
            const open = kind === "open";
            return (
              <li key={r.id} className="rounded-card border border-border bg-white p-5 shadow-card transition-shadow hover:shadow-raised">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-fg">{label}</h2>
                    <p className="mt-1 text-sm text-fg-muted">{name || "—"}</p>
                    {kase && (
                      <Link href={`/${locale}/app/declarations/${kase.id}`} className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text hover:underline">
                        {copy.forService} {obligationLabel(kase.obligation_code, locale)} · {kase.period_token}
                      </Link>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Pill tone={kind === "open" ? "amber" : kind === "completed" ? "green-outline" : "muted"}>
                        {kind === "open" ? copy.statusOpen : kind === "completed" ? copy.statusCompleted : copy.statusWaiting}
                      </Pill>
                      {open && (
                        <span className="text-xs text-fg-muted">
                          {copy.dueWord} {formatDay(r.due_on, locale)}
                        </span>
                      )}
                    </div>
                    {open && (
                      <PrimaryButton
                        disabled={busy === r.id}
                        onClick={() => {
                          pending.current = r.id;
                          fileRef.current?.click();
                        }}
                      >
                        {busy === r.id ? copy.uploading : copy.respond}
                      </PrimaryButton>
                    )}
                  </div>
                </div>
                {r.status === "submitted" && <p className="mt-2 text-xs text-fg-subtle">{copy.receivedNotSame}</p>}
                {r.status === "returned" && <p className="mt-2 text-xs font-medium text-danger-text">{copy.returned}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,.txt"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = pending.current;
          if (file && id) void send(id, file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
