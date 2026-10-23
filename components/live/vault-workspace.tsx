"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { filingLabel, obligationLabel, type FilingStatus } from "@/lib/cases";
import { valueLabel, verdictLabel, type AcceptanceRecord, type Verdict } from "@/lib/document-review";
import { memberFromSession, subscribeFirmSession, type FirmSession } from "@/lib/firm-auth";
import { can, type Actor } from "@/lib/permissions";
import { acceptedIntoVault, filingEvidence } from "@/lib/vault";
import { supabase, type DocumentRow } from "@/lib/supabase";

/**
 * Accepted evidence, not the inbox.
 *
 * A received document stays in the inbox until the firm accepts it. This
 * screen queries that accepted set, plus filings that carry a verification
 * reference. Verdicts are shown as recorded; a failure does not drop the row.
 * Reach is the same as the inbox: a firm session, then `case.view`.
 */
export type VaultLabels = {
  signIn: string;
  inboxStays: string;
  keptDespite: string;
  acceptedTitle: string;
  filingTitle: string;
  emptyAccepted: string;
  emptyFiling: string;
  noVerdicts: string;
  allClients: string;
  allYears: string;
  openClient: string;
  openCase: string;
  evidenceRef: string;
  filingRef: string;
  offline: string;
  capped: string;
  unbound: string;
};

type FilingRow = {
  id: string;
  taxpayer_id: string;
  obligation_code: string;
  period_token: string;
  filing_status: FilingStatus;
  filing_reference: string | null;
  filing_evidence_ref: string | null;
  filing_verified_at: string | null;
};

type Assignment = { taxpayer_id: string; assigned_to: string | null };

const CAP = 500;

const verdictTone = (value: Verdict["value"]) => {
  if (value === "fail" || value === "indeterminate") return "border-amber/50 bg-amber-soft text-amber-text";
  if (value === "pass" || value === "partial") return "border-teal/40 bg-teal-soft text-teal-text";
  return "border-border bg-surface-sunken text-fg-muted";
};

export function VaultWorkspace({ locale, labels }: { locale: "fr" | "en"; labels: VaultLabels }) {
  const [session, setSession] = useState<FirmSession | null | undefined>(undefined);
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [filings, setFilings] = useState<FilingRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [clientId, setClientId] = useState("");
  const [year, setYear] = useState("");
  const [offline, setOffline] = useState(false);
  const [capped, setCapped] = useState(false);

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

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [d, c, tp, eng] = await Promise.all([
        db
          .from("documents")
          .select("*")
          .eq("review_status", "accepted")
          .order("created_at", { ascending: false })
          .limit(CAP),
        db
          .from("compliance_cases")
          .select(
            "id, taxpayer_id, obligation_code, period_token, filing_status, filing_reference, filing_evidence_ref, filing_verified_at",
          )
          .eq("filing_status", "verified")
          .not("filing_evidence_ref", "is", null)
          .order("period_token", { ascending: false })
          .limit(CAP),
        db.from("taxpayers").select("id, legal_name"),
        db.from("engagements").select("taxpayer_id, assigned_to"),
      ]);
      if (d.error || c.error || tp.error || eng.error) {
        throw d.error ?? c.error ?? tp.error ?? eng.error;
      }
      const documents = (d.data ?? []) as DocumentRow[];
      const cases = (c.data ?? []) as FilingRow[];
      setDocs(documents);
      setFilings(cases);
      setCapped(documents.length >= CAP || cases.length >= CAP);
      setNames(
        Object.fromEntries(
          ((tp.data ?? []) as { id: string; legal_name: string }[]).map((t) => [t.id, t.legal_name]),
        ),
      );
      setAssignments((eng.data ?? []) as Assignment[]);
      setOffline(false);
    } catch {
      setOffline(true);
      setDocs([]);
      setFilings([]);
      setCapped(false);
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const inReach = useCallback(
    (taxpayerId: string) => Boolean(actor && can(actor, "case.view", taxpayerId).ok),
    [actor],
  );

  const accepted = useMemo(
    () => (docs ?? []).filter((d) => acceptedIntoVault(d) && inReach(d.taxpayer_id)),
    [docs, inReach],
  );
  const evidence = useMemo(
    () => (filings ?? []).filter((c) => filingEvidence(c) && inReach(c.taxpayer_id)),
    [filings, inReach],
  );

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const d of accepted) set.add(d.created_at.slice(0, 4));
    for (const c of evidence) set.add(c.period_token.slice(0, 4));
    return [...set].sort().reverse();
  }, [accepted, evidence]);

  const clients = useMemo(() => {
    const ids = new Set<string>();
    for (const d of accepted) ids.add(d.taxpayer_id);
    for (const c of evidence) ids.add(c.taxpayer_id);
    return [...ids]
      .map((id) => ({ id, name: names[id] ?? labels.unbound }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accepted, evidence, names, labels.unbound]);

  const shownDocs = accepted.filter((d) => {
    if (clientId && d.taxpayer_id !== clientId) return false;
    if (year && !d.created_at.startsWith(year)) return false;
    return true;
  });
  const shownFilings = evidence.filter((c) => {
    if (clientId && c.taxpayer_id !== clientId) return false;
    if (year && !c.period_token.startsWith(year)) return false;
    return true;
  });

  if (session === undefined) {
    return <div className="h-24 animate-pulse rounded-card bg-surface-sunken" aria-busy="true" />;
  }
  if (session === null) {
    return (
      <p className="rounded-card border border-border bg-surface-sunken px-4 py-3 text-sm text-fg-muted">
        {labels.signIn}
      </p>
    );
  }
  if (offline) return <p className="text-sm text-amber-text">{labels.offline}</p>;
  if (docs === null || filings === null) {
    return <div className="h-24 animate-pulse rounded-card bg-surface-sunken" aria-busy="true" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-fg-subtle">{labels.inboxStays}</p>
      {capped && <p className="text-xs text-fg-muted">{labels.capped}</p>}
      <div className="flex flex-wrap gap-2">
        <Select
          label={labels.allClients}
          value={clientId}
          onChange={setClientId}
          options={[{ value: "", label: labels.allClients }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <Select
          label={labels.allYears}
          value={year}
          onChange={setYear}
          options={[{ value: "", label: labels.allYears }, ...years.map((y) => ({ value: y, label: y }))]}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-fg">{labels.acceptedTitle}</h2>
        <p className="text-xs text-fg-subtle">{labels.keptDespite}</p>
        {shownDocs.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
            {labels.emptyAccepted}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {shownDocs.map((d) => {
              const record = d.acceptance as AcceptanceRecord | null | undefined;
              return (
                <li key={d.id} className="rounded-card border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-fg">{d.file_name}</p>
                      <p className="text-xs text-fg-muted">
                        {names[d.taxpayer_id] ?? labels.unbound} · {d.created_at.slice(0, 10)}
                      </p>
                    </div>
                    <Link
                      href={`/${locale}/workspace/clients/${d.taxpayer_id}`}
                      className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text"
                    >
                      {labels.openClient}
                    </Link>
                  </div>
                  {record?.verdicts?.length ? (
                    <ul className="mt-3 flex flex-col gap-1">
                      {record.verdicts.map((v) => (
                        <li key={v.kind} className="text-xs text-fg-muted">
                          <span
                            className={`mr-2 inline-flex rounded-full border px-2 py-0.5 font-semibold ${verdictTone(v.value)}`}
                          >
                            {locale === "fr" ? valueLabel[v.value].fr : valueLabel[v.value].en}
                          </span>
                          {locale === "fr" ? verdictLabel[v.kind].fr : verdictLabel[v.kind].en}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-fg-subtle">{labels.noVerdicts}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-fg">{labels.filingTitle}</h2>
        {shownFilings.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
            {labels.emptyFiling}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {shownFilings.map((c) => (
              <li key={c.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-fg">
                      {obligationLabel(c.obligation_code, locale)} · {c.period_token}
                    </p>
                    <p className="text-xs text-fg-muted">{names[c.taxpayer_id] ?? labels.unbound}</p>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {filingLabel(c.filing_status, locale)}
                      {c.filing_reference ? ` · ${labels.filingRef} ${c.filing_reference}` : ""}
                      {c.filing_evidence_ref ? ` · ${labels.evidenceRef} ${c.filing_evidence_ref}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/${locale}/workspace/cases/${c.id}`}
                    className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text"
                  >
                    {labels.openCase}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex min-h-[44px] items-center gap-2 text-sm text-fg-muted">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
      >
        {options.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
