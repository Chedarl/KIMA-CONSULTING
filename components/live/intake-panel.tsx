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
  type VerifiedFirm = { memberId: string; organizationId: string; personLabel: string; role: "firm_staff" | "firm_reviewer" | "firm_partner" | "kima_admin" };

  const [session, setSession] = useState<FirmSession | null | undefined>(undefined);
  const [docs, setDocs] = useState<ScopedDocument[] | null>(null);
  const [firm, setFirm] = useState<VerifiedFirm | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

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
    let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const memberId = session.memberId;
    const db = supabase();

    async function refresh(): Promise<string | null> {
      try {
        // The RPC resolves auth.uid() in the database and does not expose
        // firm_members.auth_user_id, which cannot be SELECTed by portal users.
        const { data: identities, error: identityError } = await db.rpc("current_firm_intake_identity");
        const member = (identities as Array<{
          member_id: string;
          organization_id: string;
          person_label: string;
          member_role: VerifiedFirm["role"];
        }> | null)?.[0];
        if (identityError || !member || member.member_id !== memberId || !member.organization_id) {
          throw new Error("Signed-in firm membership unavailable");
        }

        const { data, error: documentError } = await db
          .from("documents")
          .select("*, document_requests!inner(taxpayer_id, organization_id, case_id)")
          .eq("document_requests.organization_id", member.organization_id)
          .order("created_at", { ascending: false })
          .limit(12);
        if (documentError) throw documentError;
        if (cancelled) return null;
        const scoped = ((data ?? []) as unknown as ScopedDocument[]).filter(
          (doc) =>
            doc.request_id &&
            doc.document_requests?.organization_id === member.organization_id &&
            doc.document_requests.taxpayer_id === doc.taxpayer_id,
        );
        setFirm({
          memberId: member.member_id,
          organizationId: member.organization_id,
          personLabel: member.person_label,
          role: member.member_role,
        });
        setDocs(scoped);
        setError(false);
        return member.organization_id;
      } catch {
        if (!cancelled) {
          setDocs([]);
          setFirm(null);
          setError(true);
        }
        return null;
      }
    }

    void (async () => {
      const organizationId = await refresh();
      if (!organizationId || cancelled) return;

      // Never subscribe to raw documents: those rows have no firm column.
      // Instead receive only this firm's request changes, and refetch the
      // firm-scoped joined documents. Other firms' changes never reach us.
      const queueRefresh = () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          debounce = null;
          if (!cancelled) void refresh();
        }, 200);
      };
      channel = db
        .channel("firm-intake-" + memberId)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "document_requests",
            filter: "organization_id=eq." + organizationId,
          },
          queueRefresh,
        )
        .subscribe((status) => {
          if (!cancelled) setLive(status === "SUBSCRIBED");
        });
      // Close the window between the initial snapshot and subscription setup.
      queueRefresh();
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (channel) void db.removeChannel(channel);
    };
  }, [session, reloadVersion]);

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
        actorMemberId: firm.memberId,
        action: `document.${decision}`,
        resourceType: "document",
        resourceId: doc.id,
        before: { review_status: previous },
        after: { review_status: decision },
      });
      if (!audited.ok) throw new Error(audited.error);

      toast(decision === "accepted" ? labels.accepted : labels.returned);
    } catch {
      // A document, request or history write may already have committed.
      // Never revert the UI to the pre-decision state without re-reading.
      setDocs(null);
      setReloadVersion((version) => version + 1);
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
              className="px-3 py-2.5"
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
                    d.review_status === "accepted" ? "text-success-text" : "text-danger-text"
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
