"use client";

import { useEffect, useState } from "react";
import { audit, demoIds, supabase, type DocumentRow } from "@/lib/supabase";
import { useToast } from "@/components/toast";

/**
 * The firm's live intake queue — the other half of the two-sided demo.
 *
 * It subscribes to document inserts, so a client's upload appears here within
 * the second, highlighted, with no refresh. The accountant can accept the
 * document or return it, and that decision travels straight back to the
 * client's portal through the same channel.
 *
 * Returning is a first-class action, not an edge case: work comes back, and a
 * queue that models only forward motion cannot represent the real process.
 */
export type IntakeLabels = {
  incoming: string;
  accept: string;
  returnIt: string;
  accepted: string;
  returned: string;
  live: string;
  connecting: string;
  offline: string;
  empty: string;
};

export function IntakePanel({ locale, labels }: { locale: "fr" | "en"; labels: IntakeLabels }) {
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [ids, setIds] = useState<{ taxpayerId: string; organizationId: string } | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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

        const { data } = await db
          .from("documents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(12);
        if (cancelled) return;
        setDocs((data ?? []) as DocumentRow[]);

        const channel = db
          .channel("firm-intake")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "documents" },
            (payload) => {
              const row = payload.new as DocumentRow;
              setDocs((prev) => (prev ? [row, ...prev.filter((d) => d.id !== row.id)] : [row]));
              // Mark it new for a moment so the eye catches the arrival.
              setFresh((prev) => new Set(prev).add(row.id));
              window.setTimeout(
                () =>
                  setFresh((prev) => {
                    const next = new Set(prev);
                    next.delete(row.id);
                    return next;
                  }),
                4000,
              );
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "documents" },
            (payload) => {
              const row = payload.new as DocumentRow;
              setDocs((prev) => (prev ? prev.map((d) => (d.id === row.id ? row : d)) : prev));
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

  async function decide(doc: DocumentRow, decision: "accepted" | "returned") {
    if (!ids) return;
    setBusy(doc.id);
    const previous = doc.review_status;
    setDocs((prev) =>
      prev ? prev.map((d) => (d.id === doc.id ? { ...d, review_status: decision } : d)) : prev,
    );

    try {
      const db = supabase();
      const { error: docErr } = await db
        .from("documents")
        .update({ review_status: decision })
        .eq("id", doc.id);
      if (docErr) throw docErr;

      if (doc.request_id) {
        const { error: reqErr } = await db
          .from("document_requests")
          .update({
            status: decision === "accepted" ? "accepted" : "returned",
            updated_at: new Date().toISOString(),
          })
          .eq("id", doc.request_id);
        if (reqErr) throw reqErr;
      }

      const { recordCaseEvent } = await import("@/lib/record-event");
      await recordCaseEvent({
        taxpayerId: ids.taxpayerId,
        organizationId: ids.organizationId,
        actor: { role: "firm_staff", label: "Firm" },
        kind: decision === "accepted" ? "request_accepted" : "request_returned",
        from: previous,
        to: decision === "accepted" ? "accepted" : "returned",
        subject: doc.file_name,
      });
      await audit({
        taxpayerId: ids.taxpayerId,
        organizationId: ids.organizationId,
        actor: "firm",
        action: `document.${decision}`,
        resourceType: "document",
        resourceId: doc.id,
        before: { review_status: previous },
        after: { review_status: decision },
      });

      toast(decision === "accepted" ? labels.accepted : labels.returned);
    } catch {
      setDocs((prev) =>
        prev ? prev.map((d) => (d.id === doc.id ? { ...d, review_status: previous } : d)) : prev,
      );
      toast(labels.offline, "error");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return <p className="px-4 py-4 text-xs text-amber-text">{labels.offline}</p>;
  }

  if (docs === null) {
    return (
      <div className="flex flex-col gap-2 p-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <p className="flex items-center gap-2 px-3 pt-3 text-xs text-fg-subtle">
        <span
          className={`h-2 w-2 rounded-full ${live ? "pulse-dot bg-teal" : "bg-fg-subtle"}`}
          aria-hidden="true"
        />
        {live ? labels.live : labels.connecting}
      </p>

      {docs.length === 0 ? (
        <p className="px-3 py-5 text-sm text-fg-muted">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li
              key={d.id}
              className={`px-3 py-2.5 ${fresh.has(d.id) ? "flash-change" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-fg">{d.file_name}</span>
                <time
                  dateTime={d.created_at}
                  className="tnum shrink-0 font-mono text-xs text-fg-subtle"
                >
                  {new Intl.DateTimeFormat(locale === "fr" ? "fr-CM" : "en-CM", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Africa/Douala",
                  }).format(new Date(d.created_at))}
                </time>
              </div>

              {d.review_status === "pending" ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => void decide(d, "accepted")}
                    className="inline-flex min-h-[36px] items-center rounded-lg bg-teal-text px-2.5 text-xs font-semibold text-surface disabled:opacity-60"
                  >
                    {labels.accept}
                  </button>
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => void decide(d, "returned")}
                    className="inline-flex min-h-[36px] items-center rounded-lg border border-border-strong px-2.5 text-xs font-semibold text-fg-muted disabled:opacity-60"
                  >
                    {labels.returnIt}
                  </button>
                </div>
              ) : (
                <p
                  className={`mt-1 text-xs font-semibold ${
                    d.review_status === "accepted" ? "text-teal-text" : "text-danger-text"
                  }`}
                >
                  {d.review_status === "accepted" ? labels.accepted : labels.returned}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
