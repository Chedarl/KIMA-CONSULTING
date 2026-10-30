"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { demoIds, supabase, type DocumentRequestRow, type DocumentRow } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { usePortalCopy } from "@/components/client-portal/copy";
import { EmptyState, FilterBar, PageHeading, Pill, PrimaryButton } from "@/components/client-portal/ui";
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
  const copy = usePortalCopy();
  const [tab, setTab] = useState<"requested" | "uploaded">("requested");
  const [q, setQ] = useState("");
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
      db.from("document_requests").select("*").eq("taxpayer_id", resolved.taxpayerId).order("due_on"),
      db.from("documents").select("*").eq("taxpayer_id", resolved.taxpayerId).order("created_at", { ascending: false }),
      db.from("compliance_cases").select("id, obligation_code, period_token").eq("taxpayer_id", resolved.taxpayerId),
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
        organizationId: req.organization_id,
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

  const named = visible.filter((r) => {
    const label = `${locale === "fr" ? r.label_fr : r.label_en}`.toLowerCase();
    return !q.trim() || label.includes(q.trim().toLowerCase());
  });
  const missing = (requests ?? []).find((r) => requestIsOutstanding(r.status) && waitsOn(r) === "client");
  const uploaded = docs.filter((d) => !q.trim() || d.file_name.toLowerCase().includes(q.trim().toLowerCase()));

  async function download(path: string) {
    const { data, error } = await supabase().storage.from("kima-demo").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast(labels.failed, "error");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeading
        title={copy.documentsTitle}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {copy.receivedNotSame}
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
              <span className={`h-2 w-2 rounded-full ${live ? "bg-teal" : "bg-fg-subtle"}`} aria-hidden />
              {live ? labels.live : labels.connecting}
            </span>
          </span>
        }
      />

      <div className="flex gap-6 border-b border-border" role="tablist">
        {(
          [
            ["requested", copy.tabRequested],
            ["uploaded", copy.tabUploaded],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px inline-flex min-h-[44px] items-center border-b-2 px-1 text-sm font-semibold ${
              tab === id ? "border-teal-text text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <FilterBar label={copy.searchDocs} value={q} onChange={setQ} placeholder={copy.searchDocs} />

      {tab === "requested" && missing && (
        <section className="rounded-card border border-amber/40 bg-[#FFF8EC] p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-text">{copy.actionNeeded}</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-fg">
            {locale === "fr" ? missing.label_fr : missing.label_en}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{labels.receivedNotAccepted}</p>
          <div className="mt-4">
            <PrimaryButton
              disabled={busy === missing.id}
              onClick={() => {
                pendingFor.current = missing.id;
                fileInput.current?.click();
              }}
            >
              {busy === missing.id ? labels.uploading : copy.upload}
            </PrimaryButton>
          </div>
        </section>
      )}

      {tab === "requested" && (
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label={copy.tabRequested}>
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-3 text-sm font-semibold ${
                filter === f.id ? "border-[#1B4E89] bg-[#1B4E89] text-white" : "border-border bg-white text-fg-muted hover:bg-surface-sunken"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {tab === "uploaded" ? (
        uploaded.length === 0 ? (
          <EmptyState title={docs.length === 0 ? copy.noUploaded : copy.docsNoMatch} hint={docs.length === 0 ? copy.noUploadedHint : copy.docsNoMatchHint} />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-fg-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-medium">{copy.colName}</th>
                  <th className="px-4 py-3 font-medium">{copy.colStatus}</th>
                  <th className="px-4 py-3 font-medium">{copy.colDate}</th>
                  <th className="px-4 py-3 font-medium">{copy.colAction}</th>
                </tr>
              </thead>
              <tbody>
                {uploaded.map((d) => {
                  const req = requests?.find((r) => r.id === d.request_id);
                  const accepted = req?.status === "accepted" || d.review_status === "accepted";
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-surface-sunken">
                      <td className="px-4 py-3 font-medium text-fg">{d.file_name}</td>
                      <td className="px-4 py-3">
                        <Pill tone={accepted ? "green" : "green-outline"}>{accepted ? copy.statusAccepted : copy.statusReceived}</Pill>
                      </td>
                      <td className="tnum px-4 py-3 text-fg-muted">{d.created_at.slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        {d.storage_path ? (
                          <button type="button" onClick={() => void download(d.storage_path!)} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-[#1B4E89] hover:underline">
                            {copy.download}
                          </button>
                        ) : (
                          <span className="text-xs text-fg-muted">{copy.noFile}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : named.length === 0 ? (
        <EmptyState title={(requests ?? []).length === 0 ? copy.noRequested : copy.docsNoMatch} hint={(requests ?? []).length === 0 ? copy.noRequestedHint : copy.docsNoMatchHint} />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-fg-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">{copy.colName}</th>
                <th className="px-4 py-3 font-medium">{copy.colStatus}</th>
                <th className="px-4 py-3 font-medium">{copy.colDetails}</th>
                <th className="px-4 py-3 font-medium">{copy.colAction}</th>
              </tr>
            </thead>
            <tbody>
              {named.map((r) => {
                const label = locale === "fr" ? r.label_fr : r.label_en;
                const accepted = r.status === "accepted";
                const received = r.status === "submitted";
                const mine = requestIsOutstanding(r.status) && waitsOn(r) === "client";
                const kase = caseOf(r.case_id);
                const isBusy = busy === r.id;
                return (
                  <tr
                    key={r.id}
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
                    className={`border-b border-border last:border-0 hover:bg-surface-sunken ${dragOver === r.id ? "bg-teal-soft" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-fg">{label}</p>
                      {kase && (
                        <Link href={`/${locale}/app/declarations/${kase.id}`} className="text-xs font-semibold text-teal-text hover:underline">
                          {labels.forService} {obligationLabel(kase.obligation_code, locale)} · {kase.period_token}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={accepted ? "green" : received ? "green-outline" : mine ? "amber" : "muted"}>
                        {accepted ? copy.statusAccepted : received ? copy.statusReceived : mine ? copy.statusMissing : requestStatusLabel(r.status, locale)}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {mine ? `${copy.requestedBy} ${r.due_on}` : received ? labels.receivedNotAccepted : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {mine ? (
                        <PrimaryButton
                          disabled={isBusy}
                          onClick={() => {
                            pendingFor.current = r.id;
                            fileInput.current?.click();
                          }}
                        >
                          {isBusy ? labels.uploading : copy.upload}
                        </PrimaryButton>
                      ) : (
                        <span className="text-xs text-fg-subtle">{copy.dropHint}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
