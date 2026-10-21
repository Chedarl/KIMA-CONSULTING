"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  audit,
  demoIds,
  supabase,
  type DocumentRequestRow,
  type DocumentRow,
} from "@/lib/supabase";
import { useToast } from "@/components/toast";

/**
 * The document centre, live.
 *
 * This is the slice that makes the product real: a client drags a file in, it
 * lands in Supabase Storage, the request flips to `submitted`, an activity
 * event is written, and the firm's intake queue updates in another browser
 * within the second — no refresh on either side.
 *
 * Writes are optimistic and reconciled by the realtime feed, so the interface
 * never waits on the network to feel responsive. A failure rolls the row back
 * and says so: a false success is worse than no success.
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
};

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
  const [ids, setIds] = useState<{ taxpayerId: string; organizationId: string } | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingFor = useRef<string | null>(null);

  // Initial load, then subscribe. The subscription is the source of truth
  // afterwards, so both tabs converge on the same rows.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const db = supabase();
        const resolved = await demoIds();
        if (cancelled) return;
        if (!resolved) {
          setError(true);
          return;
        }
        setIds(resolved);

        const [{ data: reqs }, { data: documents }] = await Promise.all([
          db.from("document_requests").select("*").order("due_on"),
          db.from("documents").select("*").order("created_at", { ascending: false }),
        ]);
        if (cancelled) return;
        setRequests((reqs ?? []) as DocumentRequestRow[]);
        setDocs((documents ?? []) as DocumentRow[]);

        const channel = db
          .channel("client-documents")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "document_requests" },
            (payload) => {
              const row = payload.new as DocumentRequestRow;
              if (!row?.id) return;
              setRequests((prev) =>
                prev ? prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : prev,
              );
            },
          )
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "documents" },
            (payload) => {
              const row = payload.new as DocumentRow;
              setDocs((prev) => (prev.some((d) => d.id === row.id) ? prev : [row, ...prev]));
            },
          )
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
  }, []);

  const upload = useCallback(
    async (requestId: string, file: File) => {
      if (!ids) return;
      const req = requests?.find((r) => r.id === requestId);
      if (!req) return;

      setBusy(requestId);
      // Optimistic: flip the row now, reconcile or roll back after.
      setRequests((prev) =>
        prev ? prev.map((r) => (r.id === requestId ? { ...r, status: "submitted" } : r)) : prev,
      );

      try {
        const db = supabase();
        const safe = file.name.replace(/[^\w.\-]/g, "_");
        const path = `${ids.taxpayerId}/${requestId}/${Date.now()}-${safe}`;

        const { error: upErr } = await db.storage
          .from("kima-demo")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;

        const { error: docErr } = await db.from("documents").insert({
          request_id: requestId,
          taxpayer_id: ids.taxpayerId,
          file_name: file.name,
          storage_path: path,
          byte_size: file.size,
          mime_type: file.type || "application/octet-stream",
          uploaded_by: "taxpayer",
          arrived_via: "upload",
          review_status: "pending",
        });
        if (docErr) throw docErr;

        const { error: reqErr } = await db
          .from("document_requests")
          .update({ status: "submitted", updated_at: new Date().toISOString() })
          .eq("id", requestId);
        if (reqErr) throw reqErr;

        await db.from("activity_events").insert({
          taxpayer_id: ids.taxpayerId,
          actor: "taxpayer",
          text_fr: `Vous avez transmis : ${req.label_fr}`,
          text_en: `You sent: ${req.label_en}`,
        });
        await audit({
          taxpayerId: ids.taxpayerId,
          organizationId: ids.organizationId,
          actor: "taxpayer",
          action: "document.uploaded",
          resourceType: "document_request",
          resourceId: requestId,
          before: { status: req.status },
          after: { status: "submitted", file: file.name },
        });

        toast(`${labels.uploaded} — ${locale === "fr" ? req.label_fr : req.label_en}`);
      } catch {
        setRequests((prev) =>
          prev ? prev.map((r) => (r.id === requestId ? { ...r, status: req.status } : r)) : prev,
        );
        toast(labels.failed, "error");
      } finally {
        setBusy(null);
      }
    },
    [ids, requests, locale, labels, toast],
  );

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

  const open = requests.filter(
    (r) => r.responsible === "taxpayer" && !["submitted", "accepted"].includes(r.status),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-xs text-fg-subtle">
        <span
          className={`h-2 w-2 rounded-full ${live ? "pulse-dot bg-teal" : "bg-fg-subtle"}`}
          aria-hidden="true"
        />
        {live ? labels.live : labels.connecting}
      </p>

      <ul className="flex flex-col gap-2.5">
        {requests.map((r, i) => {
          const label = locale === "fr" ? r.label_fr : r.label_en;
          const reason = locale === "fr" ? r.reason_fr : r.reason_en;
          const done = r.status === "submitted" || r.status === "accepted";
          const mine = r.responsible === "taxpayer";
          const file = docs.find((d) => d.request_id === r.id);
          const isBusy = busy === r.id;

          return (
            <li key={r.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}>
              <div
                onDragOver={(e) => {
                  if (!mine || done) return;
                  e.preventDefault();
                  setDragOver(r.id);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  if (!mine || done) return;
                  e.preventDefault();
                  setDragOver(null);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void upload(r.id, f);
                }}
                className={`rounded-card border bg-surface p-4 transition-all ${
                  dragOver === r.id
                    ? "border-dashed border-teal bg-teal-soft ring-2 ring-teal/30"
                    : "border-border hover:border-border-strong"
                } ${isBusy ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      done
                        ? "border-teal-text bg-teal-text text-surface"
                        : r.status === "returned"
                          ? "border-danger-text text-danger-text"
                          : "border-dashed border-amber-text/60"
                    }`}
                    aria-hidden="true"
                  >
                    {done && (
                      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" stroke="currentColor" fill="none">
                        <path
                          d="M3.5 7.2 6 9.7l5-5.4"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg">{label}</span>
                    <span className="block text-xs text-fg-subtle">
                      {mine ? labels.withYou : labels.withFirm} · {labels.due} {r.due_on}
                    </span>
                  </span>

                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-fg-muted">
                    {labels.status[r.status] ?? r.status}
                  </span>

                  {mine && !done && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        pendingFor.current = r.id;
                        fileInput.current?.click();
                      }}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-3 text-sm font-semibold text-surface transition-colors hover:bg-navy-strong disabled:opacity-60"
                    >
                      {isBusy ? labels.uploading : labels.dropHere}
                    </button>
                  )}
                </div>

                {reason && !done && (
                  <p className="mt-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-fg-muted">
                    {reason}
                  </p>
                )}

                {file && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-teal-text">
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden="true"
                    >
                      <path d="M4.5 2.5h5l3 3v8h-8z" />
                      <path d="M9.5 2.5v3h3" />
                    </svg>
                    <span className="truncate font-mono">{file.file_name}</span>
                  </p>
                )}

                {mine && !done && <p className="mt-2 text-xs text-fg-subtle">{labels.dropHint}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {open.length === 0 && (
        <p className="rounded-card border border-teal-text/30 bg-teal-soft px-4 py-3 text-sm text-teal-text">
          {labels.empty}
        </p>
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
