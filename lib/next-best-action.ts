/**
 * One next best action — pure, bilingual, sourced.
 *
 * PROTOTYPE ENGINE (Agent B, 27 Oct 2026), mock data only.
 *
 * Rules (test protocol A-7, A-8; thesis §4):
 * - Exactly one action is returned, never a list.
 * - Every action carries a source. Either it is a statement about KIMA's own
 *   record, which KIMA controls (journeys.md §1), cited as `verified` with the
 *   document that fixes it; or it depends on what the administration does, and
 *   then it carries the fallback "not yet confirmed — ask your tax centre".
 *   No tax rule, deadline, hotline number or procedure is stated here: none of
 *   sources S-1…S-5 (`security-and-sources.md` §2) is verified yet.
 * - It never suggests paying again. The type makes `suggestsPayment` the
 *   literal `false`; there is no "pay" action to return.
 */

import type { CertificateStatus, Incident, PaymentState } from "./incidents";
import { isOfficialEvidence } from "./incidents";

export type Bilingual = { fr: string; en: string };

/** The bilingual fallback. Used whenever an action depends on the administration. */
export const NOT_YET_CONFIRMED: Bilingual = {
  fr: "Pas encore confirmé — renseignez-vous auprès de votre centre des impôts",
  en: "Not yet confirmed — ask your tax centre",
};

export type Source =
  | {
      status: "verified";
      /** KIMA's own record-keeping rule — never a tax rule. */
      kind: "kima_policy";
      ref: string;
      label: Bilingual;
    }
  | { status: "not_yet_confirmed"; fallback: Bilingual };

const KIMA_RECORD: Source = {
  status: "verified",
  kind: "kima_policy",
  ref: "docs/strategy/2026-10-27-taxpayer-first/thesis.md §4; journeys.md §1",
  label: {
    fr: "Règle KIMA sur la tenue de votre dossier (pas une règle fiscale)",
    en: "KIMA rule on keeping your record (not a tax rule)",
  },
};

const ADMINISTRATION: Source = { status: "not_yet_confirmed", fallback: NOT_YET_CONFIRMED };

export type ActionId =
  | "record_what_happened"
  | "check_for_debit"
  | "record_reference"
  | "attach_debit_proof"
  | "ask_for_receipt"
  | "log_contact"
  | "wait_for_answer"
  | "ask_about_certificate"
  | "nothing_to_do"
  | "reviewer_wait_for_evidence"
  | "reviewer_check_receipt"
  | "reviewer_follow_dispute"
  | "reviewer_resolve"
  | "reviewer_nothing_to_do";

export type NextAction = {
  id: ActionId;
  audience: "taxpayer" | "reviewer";
  title: Bilingual;
  why: Bilingual;
  source: Source;
  /** Shown beside the action when a debit is unresolved. */
  doNotPayAgain: boolean;
  /** Structural guarantee for A-8: no action may suggest paying. */
  suggestsPayment: false;
};

export type NextActionInput = {
  view: "taxpayer" | "reviewer";
  incident: Incident | null;
  /** The tax-payment state when there is no incident. */
  payment: PaymentState;
  certificate: CertificateStatus;
};

export const DO_NOT_PAY_AGAIN: Bilingual = {
  fr: "Ne payez pas une seconde fois tant que ce prélèvement n'est pas éclairci : rien de vérifié ne dit qu'il faut repayer.",
  en: "Do not pay a second time while this debit is unresolved: nothing verified says you should.",
};

function act(
  id: ActionId,
  audience: NextAction["audience"],
  title: Bilingual,
  why: Bilingual,
  source: Source,
  doNotPayAgain: boolean,
): NextAction {
  return { id, audience, title, why, source, doNotPayAgain, suggestsPayment: false };
}

const unresolvedDebit = (p: PaymentState) =>
  p === "debit_observed" || p === "reference_recorded" || p === "disputed";

function forTaxpayer(input: NextActionInput): NextAction {
  const i = input.incident;
  const payment = i ? i.payment : input.payment;
  const hold = unresolvedDebit(payment);

  if (!i) {
    return act(
      "record_what_happened",
      "taxpayer",
      {
        fr: "Si une démarche a échoué, notez ce qui s'est passé",
        en: "If a step failed, record what happened",
      },
      {
        fr: "Aucun incident n'est ouvert. Un relevé daté de ce que vous avez vu vous servira si l'administration ne retrouve pas votre démarche.",
        en: "No incident is open. A dated record of what you saw helps if the administration cannot find your attempt.",
      },
      KIMA_RECORD,
      false,
    );
  }

  if (i.status === "resolved") {
    return act(
      "nothing_to_do",
      "taxpayer",
      { fr: "Rien à faire pour cet incident", en: "Nothing to do for this incident" },
      {
        fr: "Un réviseur a vérifié la pièce officielle et clos l'incident. Gardez votre dossier.",
        en: "A reviewer checked the official document and closed the incident. Keep your case file.",
      },
      KIMA_RECORD,
      false,
    );
  }

  if (i.type === "certificate_blocked") {
    return act(
      "ask_about_certificate",
      "taxpayer",
      {
        fr: "Demandez pourquoi l'attestation est refusée",
        en: "Ask why the certificate is refused",
      },
      {
        fr: "La délivrance de l'attestation relève de l'administration. La procédure de recours n'est pas encore vérifiée par KIMA.",
        en: "Issuing the certificate is up to the administration. KIMA has not yet verified the appeal procedure.",
      },
      ADMINISTRATION,
      false,
    );
  }

  if (payment === "unknown" || payment === "attempted") {
    return act(
      "check_for_debit",
      "taxpayer",
      {
        fr: "Vérifiez votre relevé ou vos SMS : avez-vous été débité ?",
        en: "Check your statement or SMS: were you debited?",
      },
      {
        fr: "Avant toute nouvelle tentative, il faut savoir si l'argent est parti. Si oui, notez-le ici.",
        en: "Before any new attempt you need to know whether money left your account. If it did, record it here.",
      },
      KIMA_RECORD,
      false,
    );
  }

  if (payment === "debit_observed" && !i.referenceMasked) {
    return act(
      "record_reference",
      "taxpayer",
      {
        fr: "Notez la référence de la transaction",
        en: "Record the transaction reference",
      },
      {
        fr: "Elle figure sur le SMS ou le relevé. KIMA n'en affiche que les 4 derniers caractères.",
        en: "It is on the SMS or statement. KIMA shows only its last 4 characters.",
      },
      KIMA_RECORD,
      true,
    );
  }

  const hasDebitProof = i.evidence.some((e) => e.kind !== "portal_screenshot" && !isOfficialEvidence(e.kind));
  if (hold && !hasDebitProof) {
    return act(
      "attach_debit_proof",
      "taxpayer",
      {
        fr: "Joignez la capture du SMS ou du relevé",
        en: "Attach the SMS or statement screenshot",
      },
      {
        fr: "C'est votre preuve que le prélèvement a eu lieu. Masquez tout code ou mot de passe avant la capture.",
        en: "It is your proof that the debit happened. Hide any code or password before taking it.",
      },
      KIMA_RECORD,
      true,
    );
  }

  if (i.status === "awaiting_administration") {
    return act(
      "wait_for_answer",
      "taxpayer",
      {
        fr: "Attendez la réponse et notez-la ici dès qu'elle arrive",
        en: "Wait for the answer and record it here when it arrives",
      },
      {
        fr: "Votre dernier contact est enregistré. Le délai de réponse de l'administration n'est pas connu.",
        en: "Your last contact is logged. How long the administration takes to answer is not known.",
      },
      ADMINISTRATION,
      hold,
    );
  }

  if (i.contacts.length === 0) {
    return act(
      "ask_for_receipt",
      "taxpayer",
      {
        fr: "Demandez la quittance de ce paiement à votre centre des impôts",
        en: "Ask your tax centre for the receipt for this payment",
      },
      {
        fr: "Seule une pièce officielle permet à un réviseur de vérifier le paiement. La voie de demande n'est pas encore vérifiée par KIMA.",
        en: "Only an official document lets a reviewer verify the payment. KIMA has not yet verified how to request it.",
      },
      ADMINISTRATION,
      hold,
    );
  }

  return act(
    "log_contact",
    "taxpayer",
    {
      fr: "Notez chaque contact avec l'administration",
      en: "Log every contact with the administration",
    },
    {
      fr: "Date, canal, numéro de dossier, réponse : c'est ce qui sera demandé si le litige dure.",
      en: "Date, channel, file number, answer: that is what will be asked for if the dispute lasts.",
    },
    KIMA_RECORD,
    hold,
  );
}

function forReviewer(input: NextActionInput): NextAction {
  const i = input.incident;
  const payment = i ? i.payment : input.payment;
  const hold = unresolvedDebit(payment);

  if (!i || i.status === "resolved") {
    return act(
      "reviewer_nothing_to_do",
      "reviewer",
      { fr: "Aucune vérification en attente", en: "No verification waiting" },
      {
        fr: "Aucun incident ouvert sur ce dossier.",
        en: "No open incident on this case.",
      },
      KIMA_RECORD,
      false,
    );
  }

  const official = i.evidence.filter((e) => isOfficialEvidence(e.kind));

  if (official.length > 0 && payment === "verified") {
    return act(
      "reviewer_resolve",
      "reviewer",
      { fr: "Clore l'incident en citant la pièce officielle", en: "Resolve the incident, citing the official document" },
      {
        fr: "Le paiement est vérifié. La clôture exige la pièce citée et un motif.",
        en: "The payment is verified. Resolving requires the cited document and a reason.",
      },
      KIMA_RECORD,
      false,
    );
  }

  if (official.length > 0 && (payment === "reference_recorded" || payment === "disputed")) {
    return act(
      "reviewer_check_receipt",
      "reviewer",
      {
        fr: "Contrôlez la pièce officielle contre la référence, puis vérifiez ou contestez",
        en: "Check the official document against the reference, then verify or dispute",
      },
      {
        fr: "Une pièce officielle est jointe. Un SMS de débit ne suffit jamais.",
        en: "An official document is attached. A debit SMS is never enough.",
      },
      KIMA_RECORD,
      hold,
    );
  }

  if (payment === "disputed") {
    return act(
      "reviewer_follow_dispute",
      "reviewer",
      { fr: "Suivez le litige et le journal des contacts", en: "Follow the dispute and the contact log" },
      {
        fr: "Aucune pièce officielle. La procédure de rapprochement n'est pas vérifiée (S-3).",
        en: "No official document. The reconciliation procedure is not verified (S-3).",
      },
      ADMINISTRATION,
      true,
    );
  }

  return act(
    "reviewer_wait_for_evidence",
    "reviewer",
    {
      fr: "Rien à vérifier : aucune pièce officielle",
      en: "Nothing to verify: no official document",
    },
    {
      fr: "Ce que le contribuable a déclaré est enregistré comme déclaré. Un débit seul ne se vérifie pas.",
      en: "What the taxpayer reported is recorded as declared. A debit alone cannot be verified.",
    },
    KIMA_RECORD,
    hold,
  );
}

/** Exactly one action for this view of this case. */
export function nextBestAction(input: NextActionInput): NextAction {
  return input.view === "reviewer" ? forReviewer(input) : forTaxpayer(input);
}

/** The source line as shown on screen. */
export function sourceText(source: Source, locale: "fr" | "en"): string {
  return source.status === "verified" ? source.label[locale] : source.fallback[locale];
}

