"use client";

import { useEffect, useState } from "react";
import { updateById } from "@/lib/db-write";
import { audit, supabase, type DocumentRow } from "@/lib/supabase";
import { subscribeFirmSession, type FirmSession } from "@/lib/firm-auth";
import { recordCaseEvent } from "@/lib/record-event";
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
  type ScopedDocument = DocumentRow & {
    document_requests: {
      taxpayer_id: string;
      organization_id: string;
      case_id: string | null;
    };
  };
  type VerifiedFirm = { organizationId: string; personLabel: string; role: "firm_staff" | "firm_reviewer" | "firm_partner" | "kima_admin" };

  const [session, setSession] = useState<FirmSession | null | undefined>(undefined);
  const [docs, setDocs] = useState<ScopedDocument[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [firm, setFirm] = useState<VerifiedFirm | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => subscribeFirmSession(setSession), []);

  useEffect(() => {
    if (session === undefined) return;
    setDocs(null);
    setFirm(null);
    setError(false);
    setLive(false);
    if (!session) {
      setDocs([]);
      setError(true);
      return;
    }

    let cancelled = false;
    const memberId = session.memberId;
    const db = supabase();

    // Firm sign-in is independent of taxpayer portal sign-in. Resolve the
    // authenticated member, not a portal taxpayer or any seeded fallback.
    async function refresh(newDocumentId?: string) {
      try {
        const { data: auth, error: authError } = await db.auth.getUser();
        if (authError || !auth.user) throw new Error("No authenticated firm member");
        const { data: member, error: memberError } = await db
          .from("firm_members")
          .select("organization_id, person_label, role, auth_user_id, active")
          .eq("id", memberId)
          .eq("auth_user_id", auth.user.id)
          .eq("active", true)
          .maybeSingle();
        if (memberError || !member?.organization_id) throw new Error("Firm membership unavailable");

        // The request owns the firm identity. Documents themselves carry a
        // taxpayer but no organisation, so a taxpayer-only query mixes firms.
        const { data, error: documentError } = await db
          .from("documents")
          .select("*, document_requests!inner(taxpayer_id, organization_id, case_id)")
          .eq("document_requests.organization_id", member.organization_id)
          .order("created_at", { ascending: false })
          .limit(12);
        if (documentError) throw documentError;
        if (cancelled) return;
        const scoped = ((data ?? []) as unknown as ScopedDocument[]).filter(
          (doc) =>
            doc.request_id &&
            doc.document_requests?.organization_id === member.organization_id &&
            doc.document_requests.taxpayer_id === doc.taxpayer_id,
        );
        setFirm({
          organizationId: member.organization_id as string,
          personLabel: member.person_label as string,
          role: member.role as VerifiedFirm["role"],
        });
        setDocs(scoped);
        setError(false);
        if (newDocumentId && scoped.some((doc) => doc.id === newDocumentId)) {
          setFresh((previous) => new Set(previous).add(newDocumentId));
          window.setTimeout(() => {
            if (cancelled) return;
            setFresh((previous) => {
              const next = new Set(previous);
              next.delete(newDocumentId);
              return next;
            });
          }, 4000);
        }
      } catch {
        if (!cancelled) {
          setDocs([]);
          setFirm(null);
          setError(true);
        }
      }
    }

    void refresh();
    const channel = db
      .channel("firm-intake-" + memberId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        (payload) => void refresh(payload.eventType === "INSERT" ? (payload.new as DocumentRow).id : undefined),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_requests" },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (!cancelled) setLive(status === "SUBSCRIBED");
      });

    return () => {
      cancelled = true;
      void db.removeChannel(channel);
    };
  }, [session]);

  async function decide(doc: ScopedDocument, decision: "accepted" | "returned") {
    const request = doc.document_requests;
    if (!firm || !doc.request_id || !request || doc.review_status !== "pending" ||
        request.organization_id !== firm.organizationId || request.taxpayer_id !== doc.taxpayer_id) return;
    setBusy(doc.id);
    const previous = doc.review_status;
    setDocs((prev) =>
      prev ? prev.map((d) => (d.id === doc.id ? { ...d, review_status: decision } : d)) : prev,
    );

    try {
      const written = await updateById("documents", doc.id, { review_status: decision });
      if (!written.ok) throw new Error(written.reason);

      if (doc.request_id) {
        const reqWritten = await updateById("document_requests", doc.request_id, {
          status: decision === "accepted" ? "accepted" : "returned",
          updated_at: new Date().toISOString(),
        });
        if (!reqWritten.ok) throw new Error(reqWritten.reason);
      }

      const event = await recordCaseEvent({
        caseId: request.case_id,
        taxpayerId: doc.taxpayer_id,
        organizationId: request.organization_id,
        actor: { role: firm.role, label: firm.personLabel },
        kind: decision === "accepted" ? "request_accepted" : "request_returned",
        from: previous,
        to: decision === "accepted" ? "accepted" : "returned",
        subject: doc.file_name,
      });
      if (!event.ok) throw new Error(event.error);
      const audited = await audit({
        taxpayerId: doc.taxpayer_id,
        organizationId: request.organization_id,
        actor: "firm",
        action: `document.${decision}`,
        resourceType: "document",
        resourceId: doc.id,
        before: { review_status: previous },
        after: { review_status: decision },
      });
      if (!audited.ok) throw new Error(audited.error);

      toast(decision === "accepted" ? labels.accepted : labels.returned);
    } catch {
      setDocs((prev) =>
        prev ? prev.map((d) => (d.id === doc.id ? { ...d, review_status: previous } : d)) : prev,
      );
      setError(true);
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
