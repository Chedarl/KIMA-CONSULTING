"use client";

import { useState } from "react";
import type { Incident, Result } from "@/lib/incidents";
import { FIXTURES, fixture, type FixtureId } from "@/lib/mocks/incidents";
import { nextBestAction } from "@/lib/next-best-action";
import type { IncidentCopy } from "@/lib/i18n-incident";
import { EscalationLog, History, IncidentSummary, Unresolved } from "./incident-record";
import { NextActionCard } from "./next-action-card";
import { ReviewerPanel, TaxpayerForm } from "./record-forms";
import { StatusDimensions } from "./status-dimensions";
import { secondaryBtn } from "./parts";

type View = "taxpayer" | "reviewer";

/**
 * The incident-recovery prototype. Local state only: the fixture is copied in,
 * every change goes through `lib/incidents.ts`, and nothing leaves the page.
 */
export function IncidentPrototype({ locale, t }: { locale: "fr" | "en"; t: IncidentCopy }) {
  const [fixtureId, setFixtureId] = useState<FixtureId>("F-3");
  const [view, setView] = useState<View>("taxpayer");
  const [incident, setIncident] = useState<Incident | null>(fixture("F-3").incident);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const f = fixture(fixtureId);
  const payment = incident ? incident.payment : f.payment;
  const action = nextBestAction({ view, incident, payment, certificate: f.certificate });

  function choose(id: FixtureId) {
    setFixtureId(id);
    setIncident(fixture(id).incident);
    setMessage(null);
  }

  function onResult(r: Result, okText: string) {
    if (r.ok) {
      setIncident(r.incident);
      setMessage({ ok: true, text: okText });
    } else {
      setMessage({ ok: false, text: `${t.refused}${t.colon}${t.refusal[r.reason]}` });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-card sm:flex-row sm:items-end sm:justify-between">
        <label className="text-sm text-fg">
          <span className="text-xs font-semibold text-fg-muted">{t.scenario}</span>
          <select
            className="mt-1 block min-h-[44px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg sm:w-72"
            value={fixtureId}
            onChange={(e) => choose(e.target.value as FixtureId)}
          >
            {FIXTURES.map((x) => (
              <option key={x.id} value={x.id}>
                {t.fixtures[x.id]}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col">
          <legend className="text-xs font-semibold text-fg-muted">{t.view}</legend>
          <div className="mt-1 inline-flex rounded-lg border border-border-strong p-0.5" role="radiogroup">
            {(["taxpayer", "reviewer"] as View[]).map((v) => (
              <label
                key={v}
                className={`inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center rounded-md px-4 text-sm font-semibold ${
                  view === v ? "bg-navy text-white" : "text-fg hover:bg-surface-sunken"
                }`}
              >
                <input
                  type="radio"
                  name="view"
                  value={v}
                  checked={view === v}
                  onChange={() => {
                    setView(v);
                    setMessage(null);
                  }}
                  className="sr-only"
                />
                {v === "taxpayer" ? t.viewTaxpayer : t.viewReviewer}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="button" className={secondaryBtn} onClick={() => choose(fixtureId)}>
          {t.reset}
        </button>
      </div>
      <p className="-mt-2 text-xs text-fg-subtle">{t.viewHint}</p>

      <NextActionCard action={action} locale={locale} t={t} />

      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm font-medium">
        {message && <span className={message.ok ? "text-success-text" : "text-danger-text"}>{message.text}</span>}
      </p>

      <StatusDimensions
        locale={locale}
        t={t}
        view={view}
        stage={f.stage}
        filing={f.filing}
        payment={payment}
        billing={f.billing}
        certificate={f.certificate}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <IncidentSummary incident={incident} t={t} />
          <EscalationLog incident={incident} t={t} />
        </div>
        <div className="flex flex-col gap-4">
          {view === "taxpayer" ? (
            <TaxpayerForm incident={incident} t={t} onResult={onResult} />
          ) : (
            <ReviewerPanel key={`${fixtureId}-${incident?.events.length ?? 0}`} incident={incident} t={t} onResult={onResult} />
          )}
          <Unresolved incident={incident} t={t} />
          <History incident={incident} t={t} />
        </div>
      </div>
    </div>
  );
}
