/**
 * Phase 6: minimal support-ready incident summary for an authorized screen.
 *
 * This PURE projection is not an API, permission check, payment verification,
 * official receipt, or government integration. Its caller must enforce access.
 * Free-text notes, evidence filenames and file bytes are intentionally omitted
 * to reduce accidental disclosure when copying a case summary.
 */
import type { Incident, IncidentEventKind, EvidenceKind, PaymentState } from "./incidents";

const masked = (value: string | null): string | null =>
  value ? `•••• ${value.slice(-4)}` : null;

export type SupportPacket = {
  incidentId: string;
  incidentType: Incident["type"];
  incidentStatus: Incident["status"];
  observedAt: string;
  paymentState: PaymentState;
  transactionReferenceMasked: string | null;
  evidence: Array<{ id: string; kind: EvidenceKind; capturedAt: string }>;
  contacts: Array<{ at: string; channel: Incident["contacts"][number]["channel"]; ticketMasked: string | null }>;
  timeline: Array<{ at: string; kind: IncidentEventKind; basis: "declared" | "recorded" | "verified"; actorRole: "taxpayer" | "reviewer" }>;
  disclaimer: { fr: string; en: string };
};

export function buildIncidentSupportPacket(incident: Incident): SupportPacket {
  return {
    incidentId: incident.id,
    incidentType: incident.type,
    incidentStatus: incident.status,
    observedAt: incident.observedAt,
    // Do not infer official payment merely because a debit exists.
    paymentState: incident.payment,
    transactionReferenceMasked: masked(incident.referenceMasked),
    evidence: incident.evidence.map(({ id, kind, capturedAt }) => ({ id, kind, capturedAt })),
    contacts: incident.contacts.map(({ at, channel, ticketMasked }) => ({
      at, channel, ticketMasked: masked(ticketMasked),
    })),
    timeline: incident.events.map(({ at, kind, basis, actorRole }) => ({ at, kind, basis, actorRole })),
    disclaimer: {
      fr: "Résumé du dossier KIMA uniquement ; ce document ne confirme pas le paiement auprès de l'administration.",
      en: "KIMA case summary only; this document does not confirm payment with the tax administration.",
    },
  };
}
