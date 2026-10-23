"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { demoIds, supabase, type DocumentRequestRow, type DocumentRow } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { todayInDouala, dueBucket } from "@/lib/dates";
import { submitRequestFile } from "@/lib/submit-request";
import {
  obligationLabel,
  requestIsOutstanding,
  requestStatusLabel,
  waitsOn,
  type ComplianceCase,
} from "@/lib/cases";

/**
 * The client's document desk.
 *
 * Filters follow the adopted My Day buckets, plus the two statuses a client
 * most easily confuses: received (`submitted`) and accepted. A green mark
 * appears only on `accepted`. Upload is the real action — a file is stored,
 * and the request moves to `submitted`, never to `accepted`.
 */
export type DocsLabels = {
  empty: string;
  dropHere: string;
  dropHint: string;
  uploading: string;
  uploaded: string;
  failed: string;
  withYou: string;
  withFirm: string;
  due: string;
  status: Record<string, string>;
  connecting: string;
  offline: string;
  live: string;
  all: string;
  overdue: string;
  today: string;
  soon: string;
  waiting: string;
  received: string;
  accepted: string;
  receivedNotAccepted: string;
  noMatch: string;
  forService: string;
  returnedTimes: string;
};

type Filter = "all" | "overdue" | "today" | "soon" | "waiting" | "received" | "accepted";

export function DocumentsPanel({
  locale,
  labels,
}: {
  locale: "fr" | "en";
  labels: DocsLabels;
}) {
  const toast = useToast();
  const [requests, setRequests] = useState<DocumentRequestRow[] | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [cases, setCases] = useState<Pick<ComplianceCase, "id" | "obligation_code" | "period_token">[]>([]);
  const [ids, setIds] = useState<{ taxpayerId: string; organizationId: string } | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingFor = useRef<string | null>(null);
  const today = todayInDouala();

  const load = useCallback(async () => {
    const db = supabase();
    const resolved = await demoIds();
    if (!resolved) {
      setError(true);
      return;
    }
    setIds(resolved);
    const [{ data: reqs }, { data: documents }, { data: cs }] = await Promise.all([
      db.from("document_requests").select("*").order("due_on"),
      db.from("documents").select("*").order("created_at", { ascending: false }),
      db.from("compliance_cases").select("id, obligation_code, period_token"),
    ]);
    setRequests((reqs ?? []) as DocumentRequestRow[]);
    setDocs((documents ?? []) as DocumentRow[]);
    setCases((cs ?? []) as Pick<ComplianceCase, "id" | "obligation_code" | "period_token">[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        await load();
        if (cancelled) return;
        const db = supabase();
        const channel = db
          .channel("client-documents")
          .on("postgres_changes", { event: "*", schema: "public", table: "document_requests" }, () => void load())
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "documents" }, () => void load())
          .subscribe((status) => setLive(status === "SUBSCRIBED"));
        cleanup = () => {
          db.removeChannel(channel);
        };
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [load]);

  const upload = useCallback(
    async (requestId: string, file: File) => {
      if (!ids) return;
      const req = requests?.find((r) => r.id === requestId);
      if (!req) return;
      if (!(requestIsOutstanding(req.status) && waitsOn(req) === "client")) return;

      setBusy(requestId);
      setRequests((prev) =>
        prev ? prev.map((r) => (r.id === requestId ? { ...r, status: "submitted" } : r)) : prev,
      );

      const result = await submitRequestFile({
        requestId,
        file,
        taxpayerId: ids.taxpayerId,
        organizationId: ids.organizationId,
        caseId: req.case_id ?? null,
        label: locale === "fr" ? req.label_fr : req.label_en,
        actorLabel: "Client",
        previousStatus: req.status,
      });

      if (!result.ok) {
        setRequests((prev) =>
          prev ? prev.map((r) => (r.id === requestId ? { ...r, status: req.status } : r)) : prev,
        );
        toast(labels.failed, "error");
      } else {
        toast(`${labels.uploaded} — ${locale === "fr" ? req.label_fr : req.label_en}`);
      }
      setBusy(null);
    },
    [ids, requests, locale, labels.failed, labels.uploaded, toast],
  );

  const visible = useMemo(() => {
    const list = requests ?? [];
    return list.filter((r) => {
      if (filter === "waiting") return requestIsOutstanding(r.status) && waitsOn(r) === "client";
      if (filter === "received") return r.status === "submitted";
      if (filter === "accepted") return r.status === "accepted";
      if (filter === "all") return true;
      if (!requestIsOutstanding(r.status)) return false;
      return dueBucket(r.due_on, today) === filter;
    });
  }, [requests, filter, today]);

  if (error) {
    return (
      <p className="rounded-card border border-dashed border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
        {labels.offline}
      </p>
    );
  }

  if (requests === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">{labels.connecting}</span>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 rounded-card" />
        ))}
      </div>
    );
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: labels.all },
    { id: "overdue", label: labels.overdue },
    { id: "today", label: labels.today },
    { id: "soon", label: labels.soon },
    { id: "waiting", label: labels.waiting },
    { id: "received", label: labels.received },
    { id: "accepted", label: labels.accepted },
  ];

  const caseOf = (id: string | null | undefined) => cases.find((c) => c.id === id);

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-xs text-fg-subtle">
        <span
          className={`h-2 w-2 rounded-full ${live ? "pulse-dot bg-teal" : "bg-fg-subtle"}`}
          aria-hidden="true"
        />
        {live ? labels.live : labels.connecting}
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-3 text-sm font-semibold ${
              filter === f.id ? "border-navy bg-navy text-surface" : "border-border bg-surface text-fg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-xs leading-snug text-fg-subtle">{labels.receivedNotAccepted}</p>

      {visible.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
          {labels.noMatch}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((r) => {
            const label = locale === "fr" ? r.label_fr : r.label_en;
            const reason = locale === "fr" ? r.reason_fr : r.reason_en;
            const accepted = r.status === "accepted";
            const received = r.status === "submitted";
            const mine = requestIsOutstanding(r.status) && waitsOn(r) === "client";
            const file = docs.find((d) => d.request_id === r.id);
            const isBusy = busy === r.id;
            const late = mine && dueBucket(r.due_on, today) === "overdue";
            const returned = r.status === "returned";
            const kase = caseOf(r.case_id);

            return (
              <li key={r.id}>
                <div
                  onDragOver={(e) => {
                    if (!mine) return;
                    e.preventDefault();
                    setDragOver(r.id);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    if (!mine) return;
                    e.preventDefault();
                    setDragOver(null);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void upload(r.id, f);
                  }}
                  className={`rounded-card border bg-surface p-4 ${
                    dragOver === r.id
                      ? "border-dashed border-teal bg-teal-soft ring-2 ring-teal/30"
                      : late || returned
                        ? "border-danger-text/40"
                        : "border-border"
                  } ${isBusy ? "opacity-70" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                        accepted
                          ? "border-teal-text bg-teal-text text-surface"
                          : received
                            ? "border-navy text-navy"
                            : returned
                              ? "border-danger-text text-danger-text"
                              : "border-dashed border-border-strong"
                      }`}
                      aria-hidden="true"
                    >
                      {accepted && (
                        <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" stroke="currentColor" fill="none">
                          <path d="M3.5 7.2 6 9.7l5-5.4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">{label}</span>
                      <span className="block text-xs text-fg-subtle">
                        {waitsOn(r) === "client" && requestIsOutstanding(r.status) ? labels.withYou : labels.withFirm}
                        {" · "}
                        {labels.due} {r.due_on}
                        {r.returned_count > 0 ? ` · ${r.returned_count} ${labels.returnedTimes}` : ""}
                      </span>
                      {kase && (
                        <Link
                          href={`/${locale}/app/declarations/${kase.id}`}
                          className="mt-0.5 block text-xs font-semibold text-teal-text"
                        >
                          {labels.forService} {obligationLabel(kase.obligation_code, locale)} · {kase.period_token}
                        </Link>
                      )}
                    </span>

                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        accepted
                          ? "bg-teal-soft text-teal-text"
                          : received
                            ? "bg-navy-soft text-navy"
                            : returned || late
                              ? "bg-danger-soft text-danger-text"
                              : "bg-surface-sunken text-fg-muted"
                      }`}
                    >
                      {requestStatusLabel(r.status, locale)}
                    </span>

                    {mine && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          pendingFor.current = r.id;
                          fileInput.current?.click();
                        }}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-text px-3 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-60"
                      >
                        {isBusy ? labels.uploading : labels.dropHere}
                      </button>
                    )}
                  </div>

                  {received && <p className="mt-2 text-xs text-fg-muted">{labels.receivedNotAccepted}</p>}
                  {reason && mine && (
                    <p className="mt-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-fg-muted">{reason}</p>
                  )}
                  {file && (
                    <p className="mt-2 truncate font-mono text-xs text-fg-muted">{file.file_name}</p>
                  )}
                  {mine && <p className="mt-2 text-xs text-fg-subtle">{labels.dropHint}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,.txt"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = pendingFor.current;
          if (file && id) void upload(id, file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
