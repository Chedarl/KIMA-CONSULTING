"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { OnboardingWizard, type WizardLabels } from "@/components/live/onboarding-wizard";
import { formatDay } from "@/components/client-portal/ui";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import {
  deriveSegments,
  segmentLabel,
  type AccountProfile,
  type Segment,
} from "@/lib/crm";
import { requestIsOutstanding, type RequestStatus } from "@/lib/cases";
import { useRefreshTick } from "@/lib/refresh";

/**
 * The firm's client list, with onboarding attached.
 *
 * Rows are accounts, not people: one tax file per row. The table follows the
 * 4 Nov update document, spec 05. Every value is read from the profile or from
 * the records the rest of the product uses; nothing is a stored shadow count.
 */
type TaxpayerRow = {
  id: string;
  legal_name: string;
  niu: string | null;
  contact_name: string | null;
  contact_email: string | null;
  tax_centre: string | null;
  taxpayer_type: string | null;
  tax_regime: string | null;
  accounting_framework: string | null;
  profile_verified: boolean;
  onboarded_at: string | null;
};

type EngagementRow = {
  taxpayer_id: string;
  status: string;
  revoked_at: string | null;
  accepted_at: string | null;
  authorized_at: string | null;
};

type CaseRow = {
  taxpayer_id: string;
  due_on: string | null;
  closed_at: string | null;
};

const ENGAGEMENT_LABEL: Record<string, { fr: string; en: string }> = {
  draft: { fr: "Brouillon", en: "Draft" },
  accepted: { fr: "Accepté", en: "Accepted" },
  authorized: { fr: "Autorisé", en: "Authorized" },
  revoked: { fr: "Révoqué", en: "Revoked" },
};

const ENGAGEMENT_TONE: Record<string, StatusTone> = {
  accepted: "confirmed",
  authorized: "confirmed",
  draft: "neutral",
  revoked: "refused",
};

const COPY = {
  fr: {
    legalName: "Raison sociale", niu: "NIU", centre: "Centre", regime: "Régime",
    engagement: "Engagement", next: "Prochaine", type: "Type", noValue: "—",
    unverified: "à vérifier", chase: "Relancer",
  },
  en: {
    legalName: "Legal name", niu: "NIU", centre: "Centre", regime: "Regime",
    engagement: "Engagement", next: "Next", type: "Type", noValue: "—",
    unverified: "to verify", chase: "Chase",
  },
} as const;

const segmentsOf = (c: TaxpayerRow): Segment[] =>
  deriveSegments({
    id: c.id,
    legal_name: c.legal_name,
    taxpayer_type: (c.taxpayer_type as AccountProfile["taxpayer_type"]) ?? null,
    tax_regime: (c.tax_regime as AccountProfile["tax_regime"]) ?? null,
    tax_centre: (c.tax_centre as AccountProfile["tax_centre"]) ?? null,
    accounting_framework:
      (c.accounting_framework as AccountProfile["accounting_framework"]) ?? null,
    profile_verified: c.profile_verified,
  });

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
    emailClient: string;
    emailSent: string;
    emailNone: string;
    emailNoAddress: string;
    emailBlocked: string;
  };
}) {
  const toast = useToast();
  const c = COPY[locale];
  const [clients, setClients] = useState<TaxpayerRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [engagements, setEngagements] = useState<Record<string, EngagementRow>>({});
  const [nextDue, setNextDue] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const tick = useRefreshTick();

  /**
   * Chase a client by email. The endpoint takes a taxpayer id, not an address,
   * and reads the recipient from the database — so this button cannot be
   * turned into a way to mail arbitrary people.
   */
  async function chase(id: string) {
    setSending(id);
    try {
      const { data: sessionData } = await supabase().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast(labels.emailBlocked, "error");
        return;
      }
      const res = await fetch("/api/inquiry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taxpayerId: id, locale }),
      });
      const data = (await res.json()) as { error?: string; count?: number };
      if (res.ok) {
        toast(`${labels.emailSent} (${data.count})`);
      } else if (data.error === "nothing_outstanding") {
        toast(labels.emailNone, "info");
      } else if (data.error === "no_contact_email") {
        toast(labels.emailNoAddress, "error");
      } else {
        toast(labels.emailBlocked, "error");
      }
    } catch {
      toast(labels.emailBlocked, "error");
    } finally {
      setSending(null);
    }
  }

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [people, reqs, engs, cases] = await Promise.all([
        db
          .from("taxpayers")
          .select(
            "id, legal_name, niu, contact_name, contact_email, tax_centre, taxpayer_type, tax_regime, accounting_framework, profile_verified, onboarded_at",
          )
          .order("legal_name"),
        db.from("document_requests").select("taxpayer_id, status"),
        db
          .from("engagements")
          .select("taxpayer_id, status, revoked_at, accepted_at, authorized_at"),
        db
          .from("compliance_cases")
          .select("taxpayer_id, due_on, closed_at")
          .is("closed_at", null)
          .not("due_on", "is", null)
          .order("due_on", { ascending: true }),
      ]);

      const tally: Record<string, number> = {};
      for (const r of (reqs.data ?? []) as { taxpayer_id: string; status: string }[]) {
        if (requestIsOutstanding(r.status as RequestStatus)) {
          tally[r.taxpayer_id] = (tally[r.taxpayer_id] ?? 0) + 1;
        }
      }

      const liveEngagement: Record<string, EngagementRow> = {};
      for (const e of (engs.data ?? []) as EngagementRow[]) {
        if (e.revoked_at) continue;
        const current = liveEngagement[e.taxpayer_id];
        // Accepted outranks authorized; a draft is the last resort.
        if (!current || (e.status === "accepted" && current.status !== "accepted")) {
          liveEngagement[e.taxpayer_id] = e;
        }
      }

      const earliest: Record<string, string> = {};
      for (const row of (cases.data ?? []) as CaseRow[]) {
        if (!row.due_on) continue;
        if (!earliest[row.taxpayer_id] || row.due_on < earliest[row.taxpayer_id]) {
          earliest[row.taxpayer_id] = row.due_on;
        }
      }

      setCounts(tally);
      setEngagements(liveEngagement);
      setNextDue(earliest);
      setClients((people.data ?? []) as TaxpayerRow[]);
      setError(false);
    } catch {
      setError(true);
      setClients(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

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
            <div key={i} className="skeleton h-16 rounded-card" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
          {labels.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <caption className="sr-only">{labels.listTitle}</caption>
            <thead className="border-b border-border bg-surface-sunken text-[11px] uppercase tracking-[0.08em] text-fg-muted">
              <tr>
                {[c.legalName, c.niu, c.centre, c.regime, c.engagement, c.next, c.type].map(
                  (heading) => (
                    <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ),
                )}
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map((row) => {
                const segments = segmentsOf(row);
                const type = segments.find((s) => s.kind === "type");
                const regime = segments.find((s) => s.kind === "regime");
                const engagement = engagements[row.id];
                const next = nextDue[row.id];
                const outstanding = counts[row.id] ?? 0;
                return (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-3 text-left align-top font-normal">
                      <Link
                        href={`/${locale}/workspace/clients/${row.id}`}
                        className="font-semibold text-fg underline-offset-2 hover:underline"
                      >
                        {row.legal_name}
                      </Link>
                      {row.contact_name && (
                        <span className="mt-0.5 block truncate text-xs text-fg-muted">
                          {row.contact_name}
                        </span>
                      )}
                      {outstanding > 0 && (
                        <span className="mt-1 inline-flex rounded-full bg-navy-soft px-2 py-0.5 text-[11px] font-semibold text-navy">
                          {outstanding} {labels.openRequests}
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-3 align-top font-mono text-xs text-fg-muted">
                      {row.niu ?? c.noValue}
                    </td>
                    <td className="px-4 py-3 align-top text-fg">
                      {row.tax_centre ?? labels.noCentre}
                    </td>
                    <td className="px-4 py-3 align-top text-fg">
                      {regime ? (
                        <span className={regime.verified ? "" : "text-amber-text"}>
                          {segmentLabel(regime, locale)}
                          {!regime.verified && (
                            <span className="ml-1 text-[11px]">({c.unverified})</span>
                          )}
                        </span>
                      ) : (
                        c.noValue
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {engagement ? (
                        <StatusPill size="sm" tone={ENGAGEMENT_TONE[engagement.status] ?? "neutral"}>
                          {ENGAGEMENT_LABEL[engagement.status]?.[locale] ?? engagement.status}
                        </StatusPill>
                      ) : (
                        <span className="text-fg-subtle">{c.noValue}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-fg">
                      {next ? formatDay(next, locale) : c.noValue}
                    </td>
                    <td className="px-4 py-3 align-top text-fg">
                      {type ? segmentLabel(type, locale) : c.noValue}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      {outstanding > 0 && row.contact_email ? (
                        <button
                          type="button"
                          disabled={sending === row.id}
                          onClick={() => void chase(row.id)}
                          className="inline-flex min-h-[44px] items-center rounded-lg border border-border-strong px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-sunken disabled:opacity-60"
                        >
                          {sending === row.id ? labels.connecting : c.chase}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
