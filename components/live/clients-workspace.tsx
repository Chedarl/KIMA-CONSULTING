"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { OnboardingWizard, type WizardLabels } from "@/components/live/onboarding-wizard";
import {
  deriveSegments,
  segmentLabel,
  type AccountProfile,
  type Segment,
} from "@/lib/crm";
import { requestIsOutstanding, type RequestStatus } from "@/lib/cases";

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
  taxpayer_type: string | null;
  tax_regime: string | null;
  accounting_framework: string | null;
  profile_verified: boolean;
  onboarded_at: string | null;
};

/**
 * Tone classes for a derived segment. Design tokens, never raw hex, so a
 * segment stays legible when the theme flips.
 */
const TONE: Record<Segment["tone"], string> = {
  navy: "border-navy/30 bg-navy-soft text-navy",
  teal: "border-teal/40 bg-teal-soft text-teal-text",
  amber: "border-amber/40 bg-amber-soft text-amber-text",
  danger: "border-danger-text/40 bg-danger-soft text-danger-text",
  neutral: "border-border bg-surface-sunken text-fg-muted",
};

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
  locale2?: "fr" | "en";
}) {
  const toast = useToast();
  const [clients, setClients] = useState<TaxpayerRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

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
      const { data } = await db
        .from("taxpayers")
        .select(
          "id, legal_name, contact_name, contact_email, tax_centre, taxpayer_type, tax_regime, accounting_framework, profile_verified, onboarded_at",
        )
        .order("legal_name");
      const { data: reqs } = await db.from("document_requests").select("taxpayer_id, status");

      const tally: Record<string, number> = {};
      for (const r of (reqs ?? []) as { taxpayer_id: string; status: string }[]) {
        if (requestIsOutstanding(r.status as RequestStatus)) {
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

              {/* Derived segments, not typed tags. The regime, the centre and
                  the cadence all come from the verified profile through one
                  function, so a card can never disagree with the rules — and a
                  segment resting on an unverified field is drawn dashed, so
                  reported information never reads as confirmed fact. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {segmentsOf(c).map((s) => (
                  <span
                    key={`${s.kind}:${s.code}`}
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE[s.tone]} ${
                      s.verified ? "" : "border-dashed"
                    }`}
                  >
                    {segmentLabel(s, locale)}
                  </span>
                ))}
                {(counts[c.id] ?? 0) > 0 && (
                  <span className="rounded-full bg-navy-soft px-2 py-0.5 text-xs font-semibold text-navy">
                    {counts[c.id]} {labels.openRequests}
                  </span>
                )}
              </div>

              {(counts[c.id] ?? 0) > 0 && c.contact_email && (
                <button
                  type="button"
                  disabled={sending === c.id}
                  onClick={() => void chase(c.id)}
                  className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border-strong px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-sunken disabled:opacity-60"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
                    <path d="m2.5 4.5 5.5 4 5.5-4" />
                  </svg>
                  {labels.emailClient}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
