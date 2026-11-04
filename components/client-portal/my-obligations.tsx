"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRefreshTick } from "@/lib/refresh";
import { StatusPill } from "@/components/ui/status-pill";
import { obligationsFor, type Obligation, type Regime, type TaxpayerType } from "@/lib/rules";

/**
 * What this taxpayer actually owes -- and this is where the three portals
 * genuinely part.
 *
 * The owner's requirement is that an individual, a business and a firm do not
 * share one interface. That difference is already in the data and needs no
 * second codebase: OBLIGATIONS are scoped by `taxpayerTypes`, so a business
 * carries the DSF, IS instalments, TVA, payroll IRPP, IGS and the patente,
 * while a salaried individual carries essentially one. Six against one, out of
 * lib/rules.ts, with no hand-built fork to drift.
 *
 * A regime-scoped obligation also needs a regime, and an individual has none
 * (`carriesRegime: false`), so those filter themselves out. The individual's
 * portal is quieter because their obligations are fewer -- not because a second
 * screen was written for them.
 *
 * NO DATE IS SHOWN HERE. A statutory date follows the tax centre and may be
 * prorogued, and the repo has one verified rule in fourteen. This names the
 * obligation and says how sure anyone is; the firm confirms the date on the
 * case. Printing "15 mai" here would be the one thing CLAUDE.md forbids.
 */
export type ObligationLabels = {
  none: string;
  noneHint: string;
  loading: string;
  offline: string;
  verified: string;
  unverified: string;
  cadence: Record<string, string>;
};

export function MyObligations({
  locale,
  taxpayerId,
  t,
}: {
  locale: "fr" | "en";
  taxpayerId: string | null;
  t: ObligationLabels;
}) {
  const [rows, setRows] = useState<Obligation[] | null>(null);
  const [offline, setOffline] = useState(false);
  const tick = useRefreshTick();

  const load = useCallback(async () => {
    if (!taxpayerId) {
      setRows([]);
      return;
    }
    try {
      const { data, error } = await supabase()
        .from("taxpayers")
        .select("taxpayer_type, tax_regime")
        .eq("id", taxpayerId)
        .maybeSingle();
      if (error) throw error;
      const profile = data as { taxpayer_type: TaxpayerType | null; tax_regime: Regime | null } | null;
      if (!profile?.taxpayer_type) {
        setOffline(false);
        setRows([]);
        return;
      }
      setOffline(false);
      // Inactive rules stay out: an unverified rule may not drive a live
      // obligation. That is the default and it is not relaxed here.
      setRows(obligationsFor({ type: profile.taxpayer_type, regime: profile.tax_regime }));
    } catch {
      setOffline(true);
      setRows(null);
    }
  }, [taxpayerId]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  if (offline) {
    return <p className="rounded-card border border-border bg-surface p-5 text-sm text-fg-muted">{t.offline}</p>;
  }
  if (rows === null) {
    return <p className="rounded-card border border-border bg-surface p-5 text-sm text-fg-muted">{t.loading}</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface p-6 text-center">
        <p className="text-sm font-semibold text-fg">{t.none}</p>
        <p className="mt-1 text-xs text-fg-muted">{t.noneHint}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((o) => {
        const verified = o.source?.status === "verified";
        return (
          <li
            key={o.code}
            className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">
                {locale === "fr" ? o.fr : o.en}
              </span>
              <span className="block text-xs text-fg-muted">{t.cadence[o.cadence] ?? o.cadence}</span>
            </span>
            {/*
              The verification, not the date. `estimated` is the dashed tone --
              a rule nobody has sourced must not look like a settled one.
            */}
            <StatusPill tone={verified ? "confirmed" : "estimated"} size="sm">
              {verified ? t.verified : t.unverified}
            </StatusPill>
          </li>
        );
      })}
    </ul>
  );
}
