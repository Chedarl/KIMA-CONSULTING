import { isOfficialEvidence, unresolvedItems, type Incident } from "@/lib/incidents";
import type { IncidentCopy } from "@/lib/i18n-incident";
import { BasisChip, Panel, Stamp } from "./parts";

/** What was reported, the evidence held, and the masked reference. */
export function IncidentSummary({ incident, t }: { incident: Incident | null; t: IncidentCopy }) {
  if (!incident) {
    return (
      <Panel title={t.incidentTitle} id="incident">
        <p className="text-sm text-fg-muted">{t.incidentNone}</p>
      </Panel>
    );
  }
  return (
    <Panel title={`${t.incidentTitle} · ${t.type[incident.type]}`} id="incident">
      {incident.events.some((e) => e.kind === "incident_type_changed") && (
        <p className="mb-3 rounded-lg border border-amber/50 bg-amber-soft px-3 py-2 text-sm text-amber-text" role="status">
          {t.typeSwitched}
        </p>
      )}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-fg-muted">{t.statusLabel}</dt>
          <dd className="font-semibold text-fg">{t.status[incident.status]}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t.observedAt}</dt>
          <dd>
            <Stamp iso={incident.observedAt} zone={t.timeZone} /> <span className="text-xs text-fg-subtle">({t.timeZone})</span>
          </dd>
        </div>
        {incident.attemptedStep && (
          <div>
            <dt className="text-xs text-fg-muted">{t.step}</dt>
            <dd className="text-fg">{incident.attemptedStep}</dd>
          </div>
        )}
        {incident.reportedError && (
          <div>
            <dt className="text-xs text-fg-muted">{t.reportedError}</dt>
            <dd className="text-fg">{incident.reportedError}</dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-xs text-fg-muted">{t.reference}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {incident.referenceMasked ? (
              <code className="tnum rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-sm text-fg">
                {incident.referenceMasked}
              </code>
            ) : (
              <span className="text-fg-subtle">{t.referenceNone}</span>
            )}
            <span className="text-xs text-fg-subtle">{t.referenceNote}</span>
          </dd>
        </div>
      </dl>

      <h3 className="mt-4 text-sm font-semibold text-fg">{t.evidenceTitle}</h3>
      {incident.evidence.length === 0 ? (
        <p className="mt-1 text-sm text-fg-muted">{t.evidenceNone}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {incident.evidence.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium text-fg">{t.evidenceKind[e.kind]}</span>
                <span className="block truncate font-mono text-xs text-fg-subtle">{e.label}</span>
              </span>
              <span className="flex items-center gap-2">
                <Stamp iso={e.capturedAt} zone={t.timeZone} />
                <BasisChip basis={isOfficialEvidence(e.kind) ? "recorded" : "declared"}>
                  {isOfficialEvidence(e.kind) ? t.official : t.ownRecord}
                </BasisChip>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function EscalationLog({ incident, t }: { incident: Incident | null; t: IncidentCopy }) {
  const contacts = incident?.contacts ?? [];
  return (
    <Panel title={t.logTitle} id="log">
      {contacts.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.logNone}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-fg">{t.channel[c.channel]}</span>
                <Stamp iso={c.at} zone={t.timeZone} />
              </div>
              <dl className="mt-1 grid gap-1 text-fg-muted">
                <div>
                  <dt className="inline font-medium">{t.logWith}{t.colon}</dt>
                  <dd className="inline">{c.counterparty}</dd>
                </div>
                {c.ticketMasked && (
                  <div>
                    <dt className="inline font-medium">{t.logTicket}{t.colon}</dt>
                    <dd className="inline font-mono">{c.ticketMasked}</dd>
                  </div>
                )}
                {c.response && (
                  <div>
                    <dt className="inline font-medium">{t.logResponse}{t.colon}</dt>
                    <dd className="inline">{c.response}</dd>
                  </div>
                )}
                {c.unresolved && (
                  <div>
                    <dt className="inline font-medium text-amber-text">{t.logUnresolved}{t.colon}</dt>
                    <dd className="inline text-amber-text">{c.unresolved}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function Unresolved({ incident, t }: { incident: Incident | null; t: IncidentCopy }) {
  if (!incident) return null;
  const items = unresolvedItems(incident);
  return (
    <Panel title={t.unresolvedTitle} id="unresolved">
      {items.length === 0 ? (
        <p className="text-sm text-teal-text">{t.unresolvedNothing}</p>
      ) : (
        <ul className="list-disc pl-5 text-sm text-fg">
          {items.includes("payment") && <li>{t.unresolvedPayment}</li>}
          {items.includes("incident") && <li>{t.unresolvedIncident}</li>}
        </ul>
      )}
    </Panel>
  );
}

export function History({ incident, t }: { incident: Incident | null; t: IncidentCopy }) {
  if (!incident) return null;
  const word = (v: string | null) =>
    v === null
      ? ""
      : (t.payment as Record<string, string>)[v] ??
        (t.type as Record<string, string>)[v] ??
        (t.status as Record<string, string>)[v] ??
        (t.evidenceKind as Record<string, string>)[v] ??
        (t.channel as Record<string, string>)[v] ??
        v;
  return (
    <Panel title={t.historyTitle} id="history">
      <ol className="flex flex-col gap-2">
        {[...incident.events].reverse().map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex flex-col gap-1 border-l-2 border-border pl-3 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <Stamp iso={e.at} zone={t.timeZone} />
              <BasisChip basis={e.basis}>{t.basis[e.basis]}</BasisChip>
            </span>
            <span className="text-fg">
              <span className="font-medium">{t.event[e.kind]}</span>
              {e.from ? `${t.colon}${word(e.from)} → ${word(e.to)}` : e.to ? `${t.colon}${word(e.to)}` : ""}
            </span>
            <span className="text-xs text-fg-subtle">
              {t.actor[e.actorRole]} · {e.actorLabel}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
