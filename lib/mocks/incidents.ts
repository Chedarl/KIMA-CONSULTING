/**
 * Fixtures F-1 … F-4 from `docs/strategy/2026-10-27-taxpayer-first/test-protocol.md` §1.
 *
 * SYNTHETIC. "Boutique Ndolo" is fictional. No fixture holds a real NIU, a real
 * transaction reference, a real ticket number or a real DGI document. File
 * names say "fictif / synthetic". Times are Africa/Douala (UTC+01:00).
 *
 * The taxpayer's profile is declared, not verified, and no IGS obligation is
 * active (IGS_QUARTERLY is `inferred` in `lib/rules.ts`), so no fixture carries
 * a due date or an amount.
 */

import type { BillingStatus, CaseStage, FilingStatus } from "../cases";
import type { Actor, CertificateStatus, Incident, PaymentState } from "../incidents";

export type FixtureId = "F-1" | "F-2" | "F-3" | "F-4";

export type CaseFixture = {
  id: FixtureId;
  taxpayer: {
    name: string;
    /** Every profile fact is the taxpayer's declaration. */
    regime: "IGS";
    centre: string;
    city: string;
    basis: "declared";
  };
  obligationCode: "IGS";
  period: string;
  stage: CaseStage;
  filing: FilingStatus;
  /** Used when there is no incident; otherwise the incident's own payment state wins. */
  payment: PaymentState;
  billing: BillingStatus;
  certificate: CertificateStatus;
  incident: Incident | null;
};

export const TAXPAYER_ACTOR: Actor = { role: "taxpayer", label: "Boutique Ndolo (fictif)" };

/** A reviewer with a recorded credential. Name, body and number are synthetic. */
export const REVIEWER_ACTOR: Actor = {
  role: "reviewer",
  label: "Réviseur fictif — expert-comptable",
  credential: { body: "Ordre (fictif)", number: "EC-SYNTH-0001" },
};

const TAXPAYER = {
  name: "Boutique Ndolo (fictif / synthetic)",
  regime: "IGS" as const,
  centre: "CDI Douala (déclaré)",
  city: "Douala",
  basis: "declared" as const,
};

const F2_INCIDENT: Incident = {
  id: "INC-SYNTH-F2",
  type: "payment_step_error",
  status: "open",
  observedAt: "2026-10-14T16:42:00+01:00",
  amountMinor: null,
  portalKey: "otp",
  attemptedStep: "Étape de paiement / payment step",
  reportedError: "« Erreur technique, réessayez plus tard » (texte fictif)",
  payment: "attempted",
  referenceMasked: null,
  evidence: [
    {
      id: "EV-F2-1",
      kind: "portal_screenshot",
      label: "capture-erreur-paiement-fictif.png",
      capturedAt: "2026-10-14T16:43:00+01:00",
      addedBy: "taxpayer",
    },
  ],
  contacts: [],
  resolution: null,
  verifiedBy: null,
  verifiedAt: null,
  events: [
    {
      at: "2026-10-14T16:45:00+01:00",
      kind: "incident_reported",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: null,
      to: "open",
      evidenceIds: [],
      note: null,
    },
    {
      at: "2026-10-14T16:45:00+01:00",
      kind: "payment_changed",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: "unknown",
      to: "attempted",
      evidenceIds: [],
      note: null,
    },
    {
      at: "2026-10-14T16:46:00+01:00",
      kind: "incident_evidence_added",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: null,
      to: "portal_screenshot",
      evidenceIds: ["EV-F2-1"],
      note: "capture-erreur-paiement-fictif.png",
    },
  ],
};

const F3_INCIDENT: Incident = {
  id: "INC-SYNTH-F3",
  type: "debit_not_recognised",
  status: "awaiting_administration",
  observedAt: "2026-07-16T09:10:00+01:00",
  amountMinor: null,
  portalKey: "otp",
  attemptedStep: "Paiement par portefeuille mobile / mobile-wallet payment",
  reportedError: "Débit reçu par SMS ; le portail affiche « non payé » (fictif)",
  payment: "reference_recorded",
  referenceMasked: "•••• 0000",
  evidence: [
    {
      id: "EV-F3-1",
      kind: "debit_sms",
      label: "sms-debit-fictif.png",
      capturedAt: "2026-07-15T18:02:00+01:00",
      addedBy: "taxpayer",
    },
    {
      id: "EV-F3-2",
      kind: "portal_screenshot",
      label: "portail-non-paye-fictif.png",
      capturedAt: "2026-07-16T09:05:00+01:00",
      addedBy: "taxpayer",
    },
  ],
  contacts: [
    {
      id: "CT-F3-1",
      at: "2026-07-17T10:30:00+01:00",
      channel: "in_person",
      counterparty: "Guichet du centre des impôts (fictif)",
      ticketMasked: null,
      response: "Demande de revenir avec la capture du SMS (fictif)",
      unresolved: "Paiement non retrouvé",
      recordedBy: "taxpayer",
    },
    {
      id: "CT-F3-2",
      at: "2026-07-24T11:15:00+01:00",
      channel: "phone",
      counterparty: "Assistance de l'administration (fictif)",
      ticketMasked: "•••• 0001",
      response: "Dossier transmis pour rapprochement (fictif)",
      unresolved: "Aucune quittance reçue",
      recordedBy: "taxpayer",
    },
  ],
  resolution: null,
  verifiedBy: null,
  verifiedAt: null,
  events: [
    {
      at: "2026-07-16T09:12:00+01:00",
      kind: "incident_reported",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: null,
      to: "open",
      evidenceIds: [],
      note: null,
    },
    {
      at: "2026-07-16T09:12:00+01:00",
      kind: "payment_changed",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: "unknown",
      to: "debit_observed",
      evidenceIds: ["EV-F3-1"],
      note: null,
    },
    {
      at: "2026-07-16T09:14:00+01:00",
      kind: "reference_recorded",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: null,
      to: "•••• 0000",
      evidenceIds: [],
      note: null,
    },
    {
      at: "2026-07-16T09:14:00+01:00",
      kind: "payment_changed",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: "debit_observed",
      to: "reference_recorded",
      evidenceIds: [],
      note: null,
    },
    {
      at: "2026-07-17T10:30:00+01:00",
      kind: "support_contact_logged",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: null,
      to: "in_person",
      evidenceIds: [],
      note: "Demande de revenir avec la capture du SMS (fictif)",
    },
    {
      at: "2026-07-17T10:30:00+01:00",
      kind: "incident_status_changed",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: "open",
      to: "awaiting_administration",
      evidenceIds: [],
      note: null,
    },
    {
      at: "2026-07-24T11:15:00+01:00",
      kind: "support_contact_logged",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: null,
      to: "phone",
      evidenceIds: [],
      note: "Dossier transmis pour rapprochement (fictif)",
    },
  ],
};

const F4_INCIDENT: Incident = {
  id: "INC-SYNTH-F4",
  type: "certificate_blocked",
  status: "open",
  observedAt: "2026-05-05T14:20:00+01:00",
  amountMinor: null,
  portalKey: null,
  attemptedStep: "Demande d'attestation / certificate request",
  reportedError: "« Identifiant de déclaration non reconnu » (texte fictif)",
  payment: "verified",
  referenceMasked: "•••• 0002",
  evidence: [
    {
      id: "EV-F4-1",
      kind: "official_receipt",
      label: "quittance-fictive.pdf",
      capturedAt: "2026-04-20T10:00:00+01:00",
      addedBy: "taxpayer",
    },
    {
      id: "EV-F4-2",
      kind: "portal_screenshot",
      label: "refus-attestation-fictif.png",
      capturedAt: "2026-05-05T14:18:00+01:00",
      addedBy: "taxpayer",
    },
  ],
  contacts: [],
  resolution: null,
  verifiedBy: "Réviseur fictif — expert-comptable",
  verifiedAt: "2026-04-22T09:00:00+01:00",
  events: [
    {
      at: "2026-04-22T09:00:00+01:00",
      kind: "payment_changed",
      actorRole: "reviewer",
      actorLabel: "Réviseur fictif — expert-comptable",
      basis: "verified",
      from: "reference_recorded",
      to: "verified",
      evidenceIds: ["EV-F4-1"],
      note: "Quittance contrôlée (fictif)",
    },
    {
      at: "2026-05-05T14:22:00+01:00",
      kind: "incident_reported",
      actorRole: "taxpayer",
      actorLabel: "Boutique Ndolo (fictif)",
      basis: "declared",
      from: null,
      to: "open",
      evidenceIds: [],
      note: null,
    },
  ],
};

export const FIXTURES: CaseFixture[] = [
  {
    id: "F-1",
    taxpayer: TAXPAYER,
    obligationCode: "IGS",
    period: "2026-Q3",
    stage: "documents",
    filing: "not_submitted",
    payment: "unknown",
    billing: "accepted",
    certificate: "not_requested",
    incident: null,
  },
  {
    id: "F-2",
    taxpayer: TAXPAYER,
    obligationCode: "IGS",
    period: "2026-Q3",
    stage: "filing",
    filing: "attempted",
    payment: "attempted",
    billing: "accepted",
    certificate: "not_requested",
    incident: F2_INCIDENT,
  },
  {
    id: "F-3",
    taxpayer: TAXPAYER,
    obligationCode: "IGS",
    period: "2026-Q2",
    stage: "evidence",
    filing: "verified",
    payment: "reference_recorded",
    billing: "invoiced",
    certificate: "not_requested",
    incident: F3_INCIDENT,
  },
  {
    id: "F-4",
    taxpayer: TAXPAYER,
    obligationCode: "IGS",
    period: "2026-Q1",
    stage: "delivered",
    filing: "verified",
    payment: "verified",
    billing: "outstanding",
    certificate: "blocked",
    incident: F4_INCIDENT,
  },
];

export const fixture = (id: FixtureId): CaseFixture => {
  const f = FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`unknown fixture ${id}`);
  return f;
};
