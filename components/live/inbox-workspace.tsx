"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { audit, supabase, type DocumentRow } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { updateById, updateManyById } from "@/lib/db-write";
import {
  memberFromSession,
  subscribeFirmSession,
  type FirmSession,
} from "@/lib/firm-auth";
import { can, denialLabel, type Actor, type Capability } from "@/lib/permissions";
import { valueLabel, verdictLabel, type AcceptanceRecord } from "@/lib/document-review";
import { DocumentVerdicts } from "@/components/live/document-verdicts";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";

/**
 * The firm's document inbox: everything that arrived, across every client.
 *
 * Three things happen here that could not happen before:
 *   - bulk accept or return, because chasing one document at a time is the
 *     cost the practitioner interview actually measured;
 *   - returning requires a reason, which goes back to the client verbatim —
 *     a return without a reason just produces another wrong document;
 *   - file manipulation: copy a document onto another request, or rename it,
 *     because the same bank statement often answers more than one request and
 *     re-asking the client for it is the rudest thing the product could do.
 *
 * Copy duplicates the stored object rather than referencing it, so deleting
 * one copy can never empty another request's evidence.
 */
export type InboxLabels = {
  allClients: string;
  allStatuses: string;
  status: Record<string, string>;
  selected: string;
  acceptSelected: string;
  returnSelected: string;
  returnReason: string;
  returnReasonPh: string;
  confirm: string;
  cancel: string;
  preview: string;
  copyTo: string;
  copied: string;
  rename: string;
  renamed: string;
  newName: string;
  accepted: string;
  returned: string;
  failed: string;
  partial: string;
  empty: string;
  unbound: string;
  latest: string;
  connecting: string;
  offline: string;
  live: string;
  verdictsRecorded: string;
  verdictsRequired: string;
  needFile: string;
  awaitingVerdicts: string;
  signInRequired: string;
};

type VerdictCopy = ReturnType<typeof getWorkspaceDictionary>["verdicts"];

type Client = { id: string; legal_name: string };
type Req = { id: string; taxpayer_id: string; label_fr: string; label_en: string };

export function InboxWorkspace({
  locale,
  labels,
  verdicts,
}: {
  locale: "fr" | "en";
  labels: InboxLabels;
  verdicts: VerdictCopy;
}) {
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [reqs, setReqs] = useState<Req[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState(false);
  const [session, setSession] = useState<FirmSession | null>(null);
  const [assignments, setAssignments] = useState<
    { taxpayer_id: string; assigned_to: string | null }[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [{ data: d }, { data: tp }, { data: r }, { data: eng }] = await Promise.all([
        db.from("documents").select("*").order("created_at", { ascending: false }).limit(200),
        db.from("taxpayers").select("id, legal_name"),
        db.from("document_requests").select("id, taxpayer_id, label_fr, label_en"),
        db.from("engagements").select("taxpayer_id, assigned_to"),
      ]);
      const map: Record<string, Client> = {};
      for (const c of (tp ?? []) as Client[]) map[c.id] = c;
      setClients(map);
      setReqs((r ?? []) as Req[]);
      setDocs((d ?? []) as DocumentRow[]);
      setAssignments((eng ?? []) as { taxpayer_id: string; assigned_to: string | null }[]);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => subscribeFirmSession(setSession), []);

  const actor = useMemo<Actor | null>(() => {
    if (!session) return null;
    const member = memberFromSession(session);
    return {
      kind: "firm",
      member,
      assignedTaxpayerIds: assignments
        .filter((e) => e.assigned_to && e.assigned_to === member.person_label)
        .map((e) => e.taxpayer_id),
    };
  }, [session, assignments]);

  const permittedIds = useCallback(
    (ids: string[], capability: Capability) => {
      if (!actor || !docs) return [];
      return ids.filter((id) => {
        const doc = docs.find((d) => d.id === id);
        return !!doc && can(actor, capability, doc.taxpayer_id).ok;
      });
    },
    [actor, docs],
  );

  function refuse(capability: Capability, taxpayerId: string): boolean {
    if (!actor) {
      toast(labels.signInRequired, "error");
      return true;
    }
    const verdict = can(actor, capability, taxpayerId);
    if (!verdict.ok) {
      toast(denialLabel(verdict.reason, locale), "error");
      return true;
    }
    return false;
  }

  useEffect(() => {
    void load();
    let db: ReturnType<typeof supabase> | null = null;
    let ch: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
    try {
      db = supabase();
      ch = db
        .channel(`inbox-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, (p) => {
          const row = p.new as DocumentRow;
          if (!row?.id) return;
          setDocs((prev) =>
            prev
              ? prev.some((x) => x.id === row.id)
                ? prev.map((x) => (x.id === row.id ? row : x))
                : [row, ...prev]
              : prev,
          );
        })
        .subscribe((s) => setLive(s === "SUBSCRIBED"));
    } catch {
      setError(true);
    }
    return () => {
      if (db && ch) db.removeChannel(ch);
    };
  }, [load]);

  const shown = useMemo(() => {
    if (!docs) return null;
    return docs.filter(
      (d) =>
        (!clientFilter || d.taxpayer_id === clientFilter) &&
        (!statusFilter || d.review_status === statusFilter),
    );
  }, [docs, clientFilter, statusFilter]);

  async function recordAcceptance(doc: DocumentRow, record: AcceptanceRecord) {
    if (refuse("document.review", doc.taxpayer_id)) return;
    setBusy(true);
    try {
      const written = await updateById("documents", doc.id, { acceptance: record });
      if (!written.ok) throw new Error(written.reason);
      setDocs((prev) =>
        prev ? prev.map((d) => (d.id === doc.id ? { ...d, acceptance: record } : d)) : prev,
      );
      await audit({
        taxpayerId: doc.taxpayer_id,
        actor: "firm",
        action: "document.verdicts_recorded",
        resourceType: "document",
        resourceId: doc.id,
        after: {
          verdicts: record.verdicts.map((v) => ({ kind: v.kind, value: v.value })),
        },
      });
      toast(labels.verdictsRecorded);
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "accepted" | "returned", why?: string) {
    const capability = decision === "accepted" ? "document.review" : "request.return";
    const ids = permittedIds([...sel], capability);
    if (ids.length === 0) {
      const sample = docs?.find((d) => sel.has(d.id));
      if (!actor || !sample) toast(labels.signInRequired, "error");
      else {
        const verdict = can(actor, capability, sample.taxpayer_id);
        toast(verdict.ok ? labels.signInRequired : denialLabel(verdict.reason, locale), "error");
      }
      return;
    }
    if (decision === "accepted" && ids.some((id) => !docs?.find((d) => d.id === id)?.acceptance)) {
      toast(labels.verdictsRequired, "error");
      return;
    }
    if (decision === "accepted" && ids.some((id) => !docs?.find((d) => d.id === id)?.storage_path)) {
      toast(labels.needFile, "error");
      return;
    }
    setBusy(true);
    const snapshot = new Map(docs?.map((d) => [d.id, d.review_status]) ?? []);
    const idSet = new Set(ids);
    setDocs((prev) =>
      prev ? prev.map((d) => (idSet.has(d.id) ? { ...d, review_status: decision } : d)) : prev,
    );

    const failed: string[] = [];
    try {
      const written = await updateManyById("documents", ids, { review_status: decision });
      if (!written.ok) throw new Error(written.reason);

      for (const id of ids) {
        const doc = docs?.find((d) => d.id === id);
        if (!doc?.request_id) continue;
        const patch: Record<string, unknown> = {
          status: decision === "accepted" ? "accepted" : "returned",
          updated_at: new Date().toISOString(),
        };
        if (decision === "returned") {
          patch.reason_fr = why ?? null;
          patch.reason_en = why ?? null;
        }
        const reqWritten = await updateById("document_requests", doc.request_id, patch);
        if (!reqWritten.ok) failed.push(id);

        await audit({
          taxpayerId: doc.taxpayer_id,
          actor: "firm",
          action: `document.${decision}`,
          resourceType: "document",
          resourceId: id,
          before: { review_status: snapshot.get(id) },
          after: { review_status: decision, reason: why ?? null },
        });
      }

      const byTaxpayer = new Set(ids.map((id) => docs?.find((d) => d.id === id)?.taxpayer_id));
      for (const tid of byTaxpayer) {
        if (!tid) continue;
        const { recordCaseEvent } = await import("@/lib/record-event");
        await recordCaseEvent({
          taxpayerId: tid,
          actor: { role: session?.role ?? "firm_staff", label: session?.personLabel ?? "Firm" },
          kind: decision === "accepted" ? "request_accepted" : "request_returned",
          to: decision === "accepted" ? "accepted" : "returned",
          reason: why ?? null,
        });
      }

      toast(
        failed.length > 0
          ? `${labels.partial} (${failed.length})`
          : decision === "accepted"
            ? labels.accepted
            : labels.returned,
        failed.length > 0 ? "error" : "success",
      );
      setSel(new Set());
      setReturning(false);
      setReason("");
    } catch {
      setDocs((prev) =>
        prev
          ? prev.map((d) =>
              snapshot.has(d.id) ? { ...d, review_status: snapshot.get(d.id) as string } : d,
            )
          : prev,
      );
      toast(labels.failed, "error");
    } finally {
      setBusy(false);
    }
  }

  /** Duplicate the stored object, so the copies are independent. */
  async function copyTo(doc: DocumentRow, requestId: string) {
    if (!doc.storage_path) return;
    if (refuse("document.review", doc.taxpayer_id)) return;
    setBusy(true);
    try {
      const db = supabase();
      const target = reqs.find((r) => r.id === requestId);
      if (!target) throw new Error("no target");
      const dest = `${target.taxpayer_id}/${requestId}/${Date.now()}-${doc.file_name.replace(/[^\w.\-]/g, "_")}`;

      const { error: ce } = await db.storage.from("kima-demo").copy(doc.storage_path, dest);
      if (ce) throw ce;

      const { error: ie } = await db.from("documents").insert({
        request_id: requestId,
        taxpayer_id: target.taxpayer_id,
        file_name: doc.file_name,
        storage_path: dest,
        byte_size: doc.byte_size,
        mime_type: doc.mime_type,
        uploaded_by: "firm",
        arrived_via: "copy",
        review_status: "pending",
      });
      if (ie) throw ie;

      await audit({
        taxpayerId: target.taxpayer_id,
        actor: "firm",
        action: "document.copied",
        resourceType: "document",
        resourceId: doc.id,
        after: { to_request: requestId, path: dest },
      });
      toast(labels.copied);
      await load();
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(false);
    }
  }

  async function rename(doc: DocumentRow) {
    if (refuse("document.review", doc.taxpayer_id)) return;
    const next = window.prompt(labels.newName, doc.file_name);
    if (!next || next.trim() === doc.file_name) return;
    setBusy(true);
    try {
      // The display name changes; the stored object keeps its path, so no
      // evidence link is broken by a rename.
      const written = await updateById("documents", doc.id, { file_name: next.trim() });
      if (!written.ok) throw new Error(written.reason);
      await audit({
        taxpayerId: doc.taxpayer_id,
        actor: "firm",
        action: "document.renamed",
        resourceType: "document",
        resourceId: doc.id,
        before: { file_name: doc.file_name },
        after: { file_name: next.trim() },
      });
      toast(labels.renamed);
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(false);
    }
  }

  async function preview(doc: DocumentRow) {
    if (!doc.storage_path) return;
    const { data } = await supabase().storage.from("kima-demo").createSignedUrl(doc.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    else toast(labels.failed, "error");
  }

  if (error) {
    return (
      <p className="rounded-card border border-dashed border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
        {labels.offline}
      </p>
    );
  }
  if (shown === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 rounded-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-xs text-fg-subtle">
          <span
            className={`h-2 w-2 rounded-full ${live ? "pulse-dot bg-teal" : "bg-fg-subtle"}`}
            aria-hidden="true"
          />
          {live ? labels.live : labels.connecting}
        </span>
        <label className="sr-only" htmlFor="f-client">
          {labels.allClients}
        </label>
        <select
          id="f-client"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="min-h-[44px] rounded-lg border border-border bg-surface px-2 text-sm text-fg"
        >
          <option value="">{labels.allClients}</option>
          {Object.values(clients).map((c) => (
            <option key={c.id} value={c.id}>
              {c.legal_name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-status">
          {labels.allStatuses}
        </label>
        <select
          id="f-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[44px] rounded-lg border border-border bg-surface px-2 text-sm text-fg"
        >
          <option value="">{labels.allStatuses}</option>
          {["pending", "accepted", "returned"].map((s) => (
            <option key={s} value={s}>
              {labels.status[s] ?? s}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-fg-subtle">{labels.latest}</span>
      </div>

      {!session ? (
        <p className="rounded-card border border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
          {labels.signInRequired}
        </p>
      ) : null}

      {sel.size > 0 && (
        <div className="rise-in flex flex-wrap items-center gap-2 rounded-card border border-navy/30 bg-navy-soft px-4 py-3">
          <span className="text-sm font-semibold text-navy">
            {sel.size} {labels.selected}
          </span>
          <button
            type="button"
            disabled={busy || permittedIds([...sel], "document.review").length === 0}
            onClick={() => void decide("accepted")}
            className="min-h-[44px] rounded-lg bg-teal-text px-3 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-60"
          >
            {labels.acceptSelected}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setReturning(true)}
            className="min-h-[44px] rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg disabled:opacity-60"
          >
            {labels.returnSelected}
          </button>
        </div>
      )}

      {returning && (
        <div className="rise-in flex flex-col gap-2 rounded-card border border-danger-text/30 bg-danger-soft p-4">
          <label htmlFor="why" className="text-sm font-semibold text-danger-text">
            {labels.returnReason}
          </label>
          <textarea
            id="why"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={labels.returnReasonPh}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || reason.trim().length === 0}
              onClick={() => void decide("returned", reason.trim())}
              className="min-h-[44px] rounded-lg bg-danger-text px-3 text-sm font-semibold text-surface disabled:opacity-50"
            >
              {labels.confirm}
            </button>
            <button
              type="button"
              onClick={() => {
                setReturning(false);
                setReason("");
              }}
              className="min-h-[44px] rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg"
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
          {labels.empty}
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
        <ul className="flex flex-col gap-2">
          {shown.map((d, i) => {
            const client = clients[d.taxpayer_id];
            const checked = sel.has(d.id);
            const open = (selectedId ?? shown[0]?.id) === d.id;
            const stored = d.acceptance?.verdicts ?? [];
            return (
              <li
                key={d.id}
                className={`rise-in rounded-card border bg-surface p-3 ${open ? "border-navy" : "border-border"}`}
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={d.file_name}
                    onChange={(e) =>
                      setSel((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(d.id);
                        else next.delete(d.id);
                        return next;
                      })
                    }
                    className="h-5 w-5 shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className="min-h-[44px] min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-mono text-sm text-fg">{d.file_name}</span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {client?.legal_name ?? labels.unbound} ·{" "}
                      {d.byte_size ? `${Math.round(d.byte_size / 1024)} kB` : "—"}
                    </span>
                  </button>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      d.review_status === "accepted"
                        ? "bg-teal-soft text-teal-text"
                        : d.review_status === "returned"
                          ? "bg-danger-soft text-danger-text"
                          : "bg-amber-soft text-amber-text"
                    }`}
                  >
                    {d.review_status === "pending" && d.acceptance
                      ? labels.verdictsRecorded
                      : (labels.status[d.review_status] ?? d.review_status)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {stored.length === 0 ? (
                    <span className="text-xs text-fg-subtle">{labels.awaitingVerdicts}</span>
                  ) : (
                    stored.map((v) => (
                      <span
                        key={v.kind}
                        className="rounded-full bg-surface-sunken px-2 py-1 text-xs font-medium text-fg"
                      >
                        {locale === "fr" ? verdictLabel[v.kind].fr : verdictLabel[v.kind].en}
                        {": "}
                        {locale === "fr" ? valueLabel[v.value].fr : valueLabel[v.value].en}
                      </span>
                    ))
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void preview(d)}
                    className="min-h-[44px] rounded-lg border border-border px-2.5 text-xs font-semibold text-fg-muted hover:bg-surface-sunken"
                  >
                    {labels.preview}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void rename(d)}
                    className="min-h-[44px] rounded-lg border border-border px-2.5 text-xs font-semibold text-fg-muted hover:bg-surface-sunken disabled:opacity-60"
                  >
                    {labels.rename}
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-fg-subtle">
                    {labels.copyTo}
                    <select
                      defaultValue=""
                      disabled={busy}
                      onChange={(e) => {
                        if (e.target.value) void copyTo(d, e.target.value);
                        e.target.value = "";
                      }}
                      className="min-h-[44px] rounded-lg border border-border bg-surface px-2 text-xs text-fg"
                    >
                      <option value="">—</option>
                      {reqs
                        .filter((r) => r.id !== d.request_id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {locale === "fr" ? r.label_fr : r.label_en}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
        {(() => {
          const current = shown.find((d) => d.id === (selectedId ?? shown[0]?.id));
          if (!current) return null;
          return (
            <DocumentVerdicts
              key={current.id}
              locale={locale}
              t={verdicts}
              initial={current.acceptance ?? null}
              recording={busy}
              onRecord={(record) => void recordAcceptance(current, record)}
            />
          );
        })()}
        </div>
      )}
    </div>
  );
}
