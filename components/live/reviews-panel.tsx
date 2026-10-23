"use client";

import { useCallback, useEffect, useState } from "react";
import { audit, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { updateById } from "@/lib/db-write";
import { hasBlocking, runDiagnostics, type Finding } from "@/lib/diagnostics";
import { requestIsOutstanding, type RequestStatus } from "@/lib/cases";

/**
 * Reviews and approvals, gated by diagnostics.
 *
 * Approve is disabled while any blocking finding is open — the same shape as
 * ProConnect refusing an e-file on an EF Critical diagnostic, applied to the
 * gate Kima actually owns.
 *
 * Recording filing evidence is a separate, deliberate act. The database
 * refuses a `filed` row without a reference, a capture date and a source, so
 * this component cannot fake a filing even if it were wrong.
 */
export type ReviewLabels = {
  blocking: string;
  advisory: string;
  clean: string;
  approve: string;
  approveBlocked: string;
  approved: string;
  recordEvidence: string;
  evidencePlaceholder: string;
  filed: string;
  evidenceRequired: string;
  preparedBy: string;
  reviewer: string;
  none: string;
  failed: string;
  empty: string;
  offline: string;
};

type DeclRow = {
  id: string;
  taxpayer_id: string;
  organization_id: string;
  label_fr: string;
  label_en: string;
  period: string;
  due_on: string;
  state: string;
  prepared_by: string | null;
  reviewer: string | null;
  returned_count: number;
  evidence_reference: string | null;
};

type TpRow = {
  id: string;
  legal_name: string;
  profile_verified: boolean;
  tax_centre: string | null;
  accounting_framework: string | null;
  tax_regime: string | null;
};

export function ReviewsPanel({ locale, labels }: { locale: "fr" | "en"; labels: ReviewLabels }) {
  const toast = useToast();
  const [decls, setDecls] = useState<DeclRow[] | null>(null);
  const [taxpayers, setTaxpayers] = useState<Record<string, TpRow>>({});
  const [counts, setCounts] = useState<Record<string, { open: number; returned: number }>>({});
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [{ data: d }, { data: tp }, { data: reqs }] = await Promise.all([
        db.from("declarations").select("*").order("due_on"),
        db
          .from("taxpayers")
          .select("id, legal_name, profile_verified, tax_centre, accounting_framework, tax_regime"),
        db.from("document_requests").select("taxpayer_id, status, returned_count"),
      ]);

      const byId: Record<string, TpRow> = {};
      for (const row of (tp ?? []) as TpRow[]) byId[row.id] = row;

      const tally: Record<string, { open: number; returned: number }> = {};
      for (const r of (reqs ?? []) as {
        taxpayer_id: string;
        status: string;
        returned_count: number;
      }[]) {
        const slot = (tally[r.taxpayer_id] ??= { open: 0, returned: 0 });
        if (requestIsOutstanding(r.status as RequestStatus)) {
          slot.open += 1;
        }
        if (r.returned_count > 0) slot.returned += 1;
      }

      setTaxpayers(byId);
      setCounts(tally);
      setDecls((d ?? []) as DeclRow[]);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(decl: DeclRow, findings: Finding[]) {
    setBusy(decl.id);
    try {
      const db = supabase();
      await db.from("validation_findings").insert(
        findings.map((f) => ({
          declaration_id: decl.id,
          taxpayer_id: decl.taxpayer_id,
          check_code: f.code,
          severity: f.severity,
          message_fr: f.fr,
          message_en: f.en,
          status: "open",
        })),
      );

      // Approved and submitted, but NOT filed: filing waits on evidence.
      const written = await updateById("declarations", decl.id, {
        state: "awaiting_evidence",
        updated_at: new Date().toISOString(),
      });
      if (!written.ok) throw new Error(written.reason);

      const { recordCaseEvent } = await import("@/lib/record-event");
      await recordCaseEvent({
        taxpayerId: decl.taxpayer_id,
        organizationId: decl.organization_id,
        actor: { role: "firm_reviewer", label: "Firm" },
        kind: "note_added",
        subject: decl.period,
        reason: `Déclaration approuvée / Declaration approved for ${decl.period}`,
      });
      await audit({
        taxpayerId: decl.taxpayer_id,
        organizationId: decl.organization_id,
        actor: "firm",
        action: "declaration.approved",
        resourceType: "declaration",
        resourceId: decl.id,
        before: { state: decl.state },
        after: { state: "awaiting_evidence" },
      });

      toast(labels.approved);
      await load();
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(null);
    }
  }

  async function recordEvidence(decl: DeclRow) {
    const ref = (evidence[decl.id] ?? "").trim();
    if (!ref) {
      toast(labels.evidenceRequired, "error");
      return;
    }
    setBusy(decl.id);
    try {
      const db = supabase();
      const written = await updateById("declarations", decl.id, {
        state: "filed",
        evidence_reference: ref,
        evidence_captured_on: new Date().toISOString().slice(0, 10),
        evidence_source: "official_receipt",
        updated_at: new Date().toISOString(),
      });
      // The database CHECK refuses a filed row without all three evidence
      // fields, so a failure here is the guarantee working, not a glitch.
      // updateById also treats a zero-row PATCH as a refusal.
      if (!written.ok) throw new Error(written.reason);

      const { recordCaseEvent } = await import("@/lib/record-event");
      await recordCaseEvent({
        taxpayerId: decl.taxpayer_id,
        organizationId: decl.organization_id,
        actor: { role: "firm_reviewer", label: "Firm" },
        kind: "filing_verified",
        to: "verified",
        subject: ref,
        reason: `Dépôt confirmé pour ${decl.period}`,
      });
      await audit({
        taxpayerId: decl.taxpayer_id,
        organizationId: decl.organization_id,
        actor: "firm",
        action: "declaration.filed",
        resourceType: "declaration",
        resourceId: decl.id,
        after: { evidence_reference: ref },
      });

      toast(labels.filed);
      setEvidence((p) => ({ ...p, [decl.id]: "" }));
      await load();
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <p className="rounded-card border border-dashed border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
        {labels.offline}
      </p>
    );
  }
  if (decls === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton h-40 rounded-card" />
        ))}
      </div>
    );
  }

  const pending = decls.filter((d) => d.state !== "filed");
  if (pending.length === 0) {
    return (
      <p className="rounded-card border border-teal-text/30 bg-teal-soft px-4 py-3 text-sm text-teal-text">
        {labels.empty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {pending.map((d, i) => {
        const tp = taxpayers[d.taxpayer_id];
        if (!tp) return null;
        const c = counts[d.taxpayer_id] ?? { open: 0, returned: 0 };
        const findings = runDiagnostics({
          declaration: d,
          taxpayer: tp,
          openRequests: c.open,
          returnedRequests: c.returned,
        });
        const blocked = hasBlocking(findings);
        const blockingList = findings.filter((f) => f.severity === "blocking");
        const advisoryList = findings.filter((f) => f.severity === "advisory");
        const awaitingEvidence = d.state === "awaiting_evidence";

        return (
          <section
            key={d.id}
            className="rise-in rounded-card border border-border bg-surface"
            style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="font-display text-base font-semibold text-fg">{tp.legal_name}</h3>
                <p className="text-sm text-fg-muted">
                  {locale === "fr" ? d.label_fr : d.label_en} ·{" "}
                  <span className="tnum font-mono">{d.period}</span>
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  {labels.preparedBy} {d.prepared_by ?? labels.none} · {labels.reviewer}{" "}
                  {d.reviewer ?? labels.none}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  blocked ? "bg-danger-soft text-danger-text" : "bg-teal-soft text-teal-text"
                }`}
              >
                {blocked ? `${blockingList.length} ${labels.blocking.toLowerCase()}` : labels.clean}
              </span>
            </header>

            <div className="flex flex-col gap-3 px-5 py-4">
              {blockingList.map((f) => (
                <p
                  key={f.code}
                  className="flex gap-2.5 rounded-lg border border-danger-text/30 bg-danger-soft px-3 py-2 text-sm text-danger-text"
                >
                  <span className="mt-0.5 shrink-0 font-mono text-xs font-bold" aria-hidden="true">
                    !
                  </span>
                  <span>
                    <span className="sr-only">{labels.blocking}: </span>
                    {locale === "fr" ? f.fr : f.en}
                    <span className="ml-2 font-mono text-xs opacity-70">{f.code}</span>
                  </span>
                </p>
              ))}
              {advisoryList.map((f) => (
                <p
                  key={f.code}
                  className="flex gap-2.5 rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-fg-muted"
                >
                  <span className="mt-0.5 shrink-0 font-mono text-xs" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    <span className="sr-only">{labels.advisory}: </span>
                    {locale === "fr" ? f.fr : f.en}
                    <span className="ml-2 font-mono text-xs opacity-70">{f.code}</span>
                  </span>
                </p>
              ))}

              <div className="mt-1 flex flex-wrap items-center gap-2">
                {!awaitingEvidence ? (
                  <button
                    type="button"
                    disabled={blocked || busy === d.id}
                    onClick={() => void approve(d, findings)}
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle"
                  >
                    {blocked ? labels.approveBlocked : labels.approve}
                  </button>
                ) : (
                  <>
                    <label htmlFor={`ev-${d.id}`} className="sr-only">
                      {labels.evidencePlaceholder}
                    </label>
                    <input
                      id={`ev-${d.id}`}
                      value={evidence[d.id] ?? ""}
                      onChange={(e) => setEvidence((p) => ({ ...p, [d.id]: e.target.value }))}
                      placeholder={labels.evidencePlaceholder}
                      className="min-h-[44px] flex-1 rounded-lg border border-border bg-surface px-3 font-mono text-sm text-fg"
                    />
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => void recordEvidence(d)}
                      className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 text-sm font-semibold text-surface disabled:opacity-60"
                    >
                      {labels.recordEvidence}
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
