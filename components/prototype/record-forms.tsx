"use client";

import { useState } from "react";
import {
  addEvidence,
  isOfficialEvidence,
  logContact,
  offeredIncidentTargets,
  offeredPaymentTargets,
  recordPayment,
  recordReference,
  setIncidentStatus,
  maskReference,
  type ContactChannel,
  type EvidenceKind,
  type Incident,
  type Result,
} from "@/lib/incidents";
import { REVIEWER_ACTOR, TAXPAYER_ACTOR } from "@/lib/mocks/incidents";
import type { IncidentCopy } from "@/lib/i18n-incident";
import { Panel, fieldCls, nowInDouala, primaryBtn, secondaryBtn } from "./parts";

type Option = "debit" | "reference" | "evidence" | "contact" | "escalate";

const EVIDENCE_KINDS: EvidenceKind[] = [
  "debit_sms",
  "wallet_screenshot",
  "bank_statement",
  "portal_screenshot",
  "official_receipt",
  "administration_response",
  "other",
];
const CHANNELS: ContactChannel[] = ["phone", "in_person", "email", "online_form", "other"];

/** A fresh incident for a case that had none (F-1). Declared by the taxpayer. */
export function newIncident(debit: boolean, at: string): Incident {
  return {
    id: `INC-LOCAL-${at}`,
    type: debit ? "debit_not_recognised" : "other",
    status: "open",
    detectedAt: at,
    portalKey: null,
    attemptedStep: null,
    reportedError: null,
    payment: "unknown",
    referenceMasked: null,
    evidence: [],
    contacts: [],
    resolution: null,
    verifiedBy: null,
    verifiedAt: null,
    events: [
      {
        at,
        kind: "incident_reported",
        actorRole: "taxpayer",
        actorLabel: TAXPAYER_ACTOR.label,
        basis: "declared",
        from: null,
        to: "open",
        evidenceIds: [],
        note: null,
      },
    ],
  };
}

/**
 * "Record what happened" — the taxpayer's form. Every submit goes through the
 * engine as the taxpayer actor, so the result is always `declared`. There is
 * no verify control here, by construction.
 */
export function TaxpayerForm({
  incident,
  t,
  onResult,
}: {
  incident: Incident | null;
  t: IncidentCopy;
  onResult: (r: Result, okText: string) => void;
}) {
  const [option, setOption] = useState<Option>("debit");
  const [reference, setReference] = useState("");
  const [kind, setKind] = useState<EvidenceKind>("debit_sms");
  const [fileLabel, setFileLabel] = useState("");
  const [channel, setChannel] = useState<ContactChannel>("phone");
  const [counterparty, setCounterparty] = useState("");
  const [ticket, setTicket] = useState("");
  const [response, setResponse] = useState("");
  const [open, setOpen] = useState("");

  const offered = incident ? offeredIncidentTargets(incident, TAXPAYER_ACTOR) : [];
  const options: Option[] = ["debit", "reference", "evidence", "contact"];
  if (offered.includes("escalated")) options.push("escalate");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const at = nowInDouala();
    const base = incident ?? newIncident(option === "debit", at);
    const actor = TAXPAYER_ACTOR;
    let r: Result;
    switch (option) {
      case "debit":
        r = recordPayment(base, { to: "debit_observed", actor, at });
        break;
      case "reference":
        r = recordReference(base, { reference, actor, at });
        // The full value is dropped the moment it is masked.
        setReference("");
        break;
      case "evidence":
        r = addEvidence(base, {
          evidence: { id: `EV-LOCAL-${at}`, kind, label: fileLabel.trim() || "fichier-fictif.png", capturedAt: at },
          actor,
          at,
        });
        setFileLabel("");
        break;
      case "contact":
        r = logContact(base, {
          contact: {
            id: `CT-LOCAL-${at}`,
            at,
            channel,
            counterparty: counterparty.trim() || "—",
            ticketMasked: ticket.trim() ? maskReference(ticket) : null,
            response: response.trim() || null,
            unresolved: open.trim() || null,
          },
          actor,
        });
        setCounterparty("");
        setTicket("");
        setResponse("");
        setOpen("");
        break;
      case "escalate":
        r = setIncidentStatus(base, { to: "escalated", actor, at });
        break;
    }
    onResult(r, t.recorded);
  }

  return (
    <Panel title={t.formTitle} id="record">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-xs text-fg-muted">{t.formLocal}</p>
        <fieldset>
          <legend className="text-sm font-semibold text-fg">{t.formWhat}</legend>
          <div className="mt-2 flex flex-col gap-1">
            {options.map((o) => (
              <label key={o} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-fg hover:bg-surface-sunken">
                <input
                  type="radio"
                  name="what"
                  value={o}
                  checked={option === o}
                  onChange={() => setOption(o)}
                  className="h-4 w-4 accent-[rgb(var(--navy))]"
                />
                {t.formOptions[o]}
              </label>
            ))}
          </div>
        </fieldset>

        {option === "reference" && (
          <label className="text-sm text-fg">
            {t.formReference}
            <input
              className={`${fieldCls} font-mono`}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              autoComplete="off"
              inputMode="text"
              required
              minLength={4}
            />
            <span className="mt-1 block text-xs text-fg-subtle">{t.referenceNote}</span>
          </label>
        )}

        {option === "evidence" && (
          <>
            <label className="text-sm text-fg">
              {t.formEvidenceKind}
              <select className={fieldCls} value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)}>
                {EVIDENCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t.evidenceKind[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-fg">
              {t.formEvidenceLabel}
              <input className={fieldCls} value={fileLabel} onChange={(e) => setFileLabel(e.target.value)} placeholder="capture-fictive.png" />
            </label>
          </>
        )}

        {option === "contact" && (
          <>
            <label className="text-sm text-fg">
              {t.formChannel}
              <select className={fieldCls} value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {t.channel[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-fg">
              {t.formCounterparty}
              <input className={fieldCls} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} required />
            </label>
            <label className="text-sm text-fg">
              {t.formTicket}
              <input className={`${fieldCls} font-mono`} value={ticket} onChange={(e) => setTicket(e.target.value)} autoComplete="off" />
            </label>
            <label className="text-sm text-fg">
              {t.formResponse}
              <input className={fieldCls} value={response} onChange={(e) => setResponse(e.target.value)} />
            </label>
            <label className="text-sm text-fg">
              {t.formUnresolved}
              <input className={fieldCls} value={open} onChange={(e) => setOpen(e.target.value)} />
            </label>
          </>
        )}

        <p className="text-xs font-medium text-amber-text">{t.formWarning}</p>
        <button type="submit" className={primaryBtn}>
          {t.submit}
        </button>
      </form>
    </Panel>
  );
}

/**
 * The reviewer's controls. Rendered only in the reviewer view. The engine still
 * refuses anything that lacks a credential or official evidence, and the refusal
 * is shown, so the rule is visible rather than hidden.
 */
export function ReviewerPanel({
  incident,
  t,
  onResult,
}: {
  incident: Incident | null;
  t: IncidentCopy;
  onResult: (r: Result, okText: string) => void;
}) {
  const [cited, setCited] = useState("");
  const [reason, setReason] = useState("");

  if (!incident) {
    return (
      <Panel title={t.reviewerTitle} id="review">
        <p className="text-sm text-fg-muted">{t.reviewerNothing}</p>
      </Panel>
    );
  }

  const actor = REVIEWER_ACTOR;
  const pay = offeredPaymentTargets(incident, actor);
  const moves = offeredIncidentTargets(incident, actor);
  const hasOfficial = incident.evidence.some((e) => isOfficialEvidence(e.kind));
  const ids = cited ? [cited] : [];
  const at = () => nowInDouala();
  const resolution = { outcome: "payment_confirmed" as const, reason };

  const buttons: { key: string; label: string; run: () => Result; primary?: boolean }[] = [];
  if (pay.includes("verified"))
    buttons.push({ key: "verify", label: t.reviewerVerify, primary: true, run: () => recordPayment(incident, { to: "verified", actor, evidenceIds: ids, note: reason, at: at() }) });
  if (pay.includes("disputed"))
    buttons.push({ key: "dispute", label: t.reviewerDispute, run: () => recordPayment(incident, { to: "disputed", actor, note: reason, at: at() }) });
  if (moves.includes("resolved"))
    buttons.push({ key: "resolve", label: t.reviewerResolve, run: () => setIncidentStatus(incident, { to: "resolved", actor, evidenceIds: ids, resolution, at: at() }) });
  if (moves.includes("closed_unresolved"))
    buttons.push({
      key: "close",
      label: t.reviewerCloseUnresolved,
      run: () => setIncidentStatus(incident, { to: "closed_unresolved", actor, resolution: { outcome: "no_answer", reason }, at: at() }),
    });

  return (
    <Panel title={t.reviewerTitle} id="review">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-fg-muted">{t.reviewerAs}</p>
        {!hasOfficial && <p className="text-sm font-medium text-amber-text">{t.noOfficial}</p>}
        <label className="text-sm text-fg">
          {t.reviewerCite}
          <select className={fieldCls} value={cited} onChange={(e) => setCited(e.target.value)}>
            <option value="">—</option>
            {incident.evidence.map((e) => (
              <option key={e.id} value={e.id}>
                {t.evidenceKind[e.kind]} · {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-fg">
          {t.reviewerReason}
          <input className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {buttons.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.reviewerNothing}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {buttons.map((b) => (
              <button key={b.key} type="button" className={b.primary ? primaryBtn : secondaryBtn} onClick={() => onResult(b.run(), t.reviewerDone)}>
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
