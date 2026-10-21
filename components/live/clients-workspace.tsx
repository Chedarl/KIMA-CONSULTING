"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { OnboardingWizard, type WizardLabels } from "@/components/live/onboarding-wizard";

/**
 * The firm's client list, with onboarding attached.
 *
 * Reloads after a client is created, so the new file appears without a page
 * refresh. Every taxpayer created here starts unverified and says so on the
 * card: the questionnaire records what the client reported, and a reviewer
 * confirms it against their official profile.
 */
type TaxpayerRow = {
  id: string;
  legal_name: string;
  contact_name: string | null;
  contact_email: string | null;
  tax_centre: string | null;
  profile_verified: boolean;
  onboarded_at: string | null;
};

export function ClientsWorkspace({
  locale,
  labels,
}: {
  locale: "fr" | "en";
  labels: WizardLabels & {
    listTitle: string;
    empty: string;
    unverified: string;
    openRequests: string;
    noCentre: string;
    connecting: string;
    offline: string;
  };
}) {
  const [clients, setClients] = useState<TaxpayerRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const { data } = await db
        .from("taxpayers")
        .select(
          "id, legal_name, contact_name, contact_email, tax_centre, profile_verified, onboarded_at",
        )
        .order("legal_name");
      const { data: reqs } = await db.from("document_requests").select("taxpayer_id, status");

      const tally: Record<string, number> = {};
      for (const r of (reqs ?? []) as { taxpayer_id: string; status: string }[]) {
        if (["requested", "in_progress", "returned", "in_client_review"].includes(r.status)) {
          tally[r.taxpayer_id] = (tally[r.taxpayer_id] ?? 0) + 1;
        }
      }
      setCounts(tally);
      setClients((data ?? []) as TaxpayerRow[]);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <OnboardingWizard locale={locale} labels={labels} onCreated={load} />

      {error ? (
        <p className="rounded-card border border-dashed border-amber-text/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
          {labels.offline}
        </p>
      ) : clients === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-card" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
          {labels.empty}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {clients.map((c, i) => (
            <li
              key={c.id}
              className="rise-in lift rounded-card border border-border bg-surface p-4"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-semibold text-fg">
                    {c.legal_name}
                  </p>
                  {c.contact_name && (
                    <p className="truncate text-xs text-fg-muted">{c.contact_name}</p>
                  )}
                  {c.contact_email && (
                    <p className="truncate font-mono text-xs text-fg-subtle">{c.contact_email}</p>
                  )}
                </div>
                <span className="shrink-0 rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-fg-muted">
                  {c.tax_centre ?? labels.noCentre}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!c.profile_verified && (
                  <span className="rounded-full border border-dashed border-amber-text/40 bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-text">
                    {labels.unverified}
                  </span>
                )}
                {(counts[c.id] ?? 0) > 0 && (
                  <span className="rounded-full bg-navy-soft px-2 py-0.5 text-xs font-semibold text-navy">
                    {counts[c.id]} {labels.openRequests}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
