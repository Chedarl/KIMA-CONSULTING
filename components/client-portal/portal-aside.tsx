"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRefreshTick } from "@/lib/refresh";

/**
 * The portal's right-hand column: quick actions, then what is owed.
 *
 * Every reference portal puts a single "Outstanding Balance" here. KIMA cannot.
 * A firm's fees and a taxpayer's tax are separate concepts -- CLAUDE.md is
 * explicit -- and one figure covering both would be a compliance misstatement
 * on the screen a client trusts most. So the block is labelled for exactly what
 * it counts: fees invoiced by the firm, and it says so in words rather than
 * leaving the reader to assume.
 *
 * Tax paid to the administration is deliberately absent. KIMA is not connected
 * to the DGI, so it has no basis for a figure, and a zero would read as
 * "nothing owed to the DGI" -- a claim the product cannot make. The line states
 * the limit instead.
 *
 * A debit seen is not a tax settled; an unpaid invoice is not a late
 * declaration. Keeping those apart is the whole reason this exists rather than
 * a copy of theirs.
 */
export type AsideLabels = {
  quickTitle: string;
  upload: string;
  message: string;
  feesTitle: string;
  feesScope: string;
  feesUnavailable: string;
  taxNote: string;
};

export function PortalAside({
  locale,
  taxpayerId,
  t,
}: {
  locale: "fr" | "en";
  taxpayerId: string | null;
  t: AsideLabels;
}) {
  const [owed, setOwed] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const tick = useRefreshTick();
  const base = `/${locale}/app`;

  const load = useCallback(async () => {
    if (!taxpayerId) {
      setOwed(null);
      setUnavailable(true);
      return;
    }
    try {
      const db = supabase();
      const [bills, paid] = await Promise.all([
        db.from("invoices").select("id, total_minor, status"),
        db.from("service_payments").select("invoice_id, amount_minor, status"),
      ]);
      if (bills.error) throw bills.error;
      const payments = (paid.data ?? []) as {
        invoice_id: string; amount_minor: number; status: string;
      }[];
      let total = 0;
      for (const b of (bills.data ?? []) as { id: string; total_minor: number; status: string }[]) {
        if (b.status === "void" || b.status === "draft" || b.status === "paid") continue;
        // Only confirmed payments reduce what is owed. A payment somebody says
        // they made is not a payment the firm has seen.
        const confirmed = payments
          .filter((p) => p.invoice_id === b.id && p.status === "confirmed")
          .reduce((sum, p) => sum + (p.amount_minor ?? 0), 0);
        total += Math.max(0, (b.total_minor ?? 0) - confirmed);
      }
      setUnavailable(false);
      setOwed(total);
    } catch {
      // Unknown is not zero.
      setUnavailable(true);
      setOwed(null);
    }
  }, [taxpayerId]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  return (
    <aside className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-semibold text-fg">{t.quickTitle}</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          <li>
            <Link
              href={`${base}/requests`}
              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-text"
            >
              {t.upload}
            </Link>
          </li>
          <li>
            <Link
              href={`${base}/messages`}
              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-teal-text"
            >
              {t.message}
            </Link>
          </li>
        </ul>
      </section>

      <section className="rounded-card border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-fg">{t.feesTitle}</h3>
        <p className="tnum mt-1 font-mono text-xl font-semibold text-fg">
          {unavailable || owed === null ? (
            <span className="text-fg-subtle" title={t.feesUnavailable}>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t.feesUnavailable}</span>
            </span>
          ) : (
            <>{owed.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")} XAF</>
          )}
        </p>
        <p className="mt-1 text-[11px] text-fg-muted">{t.feesScope}</p>
        {/*
          The limit, stated. KIMA is not connected to the administration, so it
          has no figure for tax paid -- and a zero here would read as "nothing
          owed to the DGI", which the product cannot claim.
        */}
        <p className="mt-3 border-t border-border pt-3 text-[11px] text-fg-subtle">{t.taxNote}</p>
      </section>
    </aside>
  );
}
