/**
 * Pre-submission diagnostics — ProConnect's "Check Return", remodelled.
 *
 * ProConnect's EF Critical diagnostics block an e-file until they are cleared.
 * Kima has no authorised e-file, so blocking a transmission would be theatre.
 * What these checks block instead is **approval** — a declaration cannot be
 * approved while a blocking finding is open, which is the gate that actually
 * exists in our workflow (Scenario E).
 *
 * They also check different things. Intuit's diagnostics check a return's
 * arithmetic. Ours check whether the *compliance preconditions* hold: is the
 * profile verified, is the tax centre known (it sets the deadline here), are
 * the documents in, is there a reviewer who is not the preparer, and is there
 * evidence behind any claim of filing.
 *
 * Pure functions, so a finding can always be explained and the rules can be
 * reviewed without running the application.
 */

export type Severity = "blocking" | "advisory";

export type Finding = {
  code: string;
  severity: Severity;
  fr: string;
  en: string;
};

export type DiagnosticInput = {
  declaration: {
    id: string;
    label_en: string;
    period: string;
    due_on: string;
    state: string;
    prepared_by: string | null;
    reviewer: string | null;
    returned_count: number;
    evidence_reference: string | null;
  };
  taxpayer: {
    profile_verified: boolean;
    tax_centre: string | null;
    accounting_framework: string | null;
    tax_regime: string | null;
  };
  openRequests: number;
  returnedRequests: number;
  today?: string;
};

const isDsf = (label: string) => label.toUpperCase().includes("DSF");

export function runDiagnostics(input: DiagnosticInput): Finding[] {
  const { declaration: d, taxpayer: tp } = input;
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const out: Finding[] = [];

  // A declaration prepared against an unverified profile may be the wrong
  // declaration entirely. First thing to establish, not the last.
  if (!tp.profile_verified) {
    out.push({
      code: "PROFILE_UNVERIFIED",
      severity: "blocking",
      fr: "Le profil fiscal du contribuable n'a pas été vérifié. La classification doit être confirmée au regard des règles en vigueur avant approbation.",
      en: "The taxpayer's tax profile is unverified. Classification must be confirmed against the rules in force before approval.",
    });
  }

  // The centre sets the statutory date here; without it there is no deadline
  // to be on time for.
  if (!tp.tax_centre) {
    out.push({
      code: "TAX_CENTRE_MISSING",
      severity: "blocking",
      fr: "Centre des impôts inconnu : l'échéance applicable ne peut pas être établie (DGE 15 mars, CIME 15 avril, CDI 15 mai).",
      en: "Tax centre unknown: the applicable deadline cannot be established (DGE 15 March, CIME 15 April, CDI 15 May).",
    });
  }

  // The accounting framework decides the DSF template. It is not implied by
  // the tax regime, and assuming it produces the wrong return.
  if (!tp.accounting_framework) {
    out.push({
      code: "FRAMEWORK_MISSING",
      severity: isDsf(d.label_en) ? "blocking" : "advisory",
      fr: "Référentiel comptable non renseigné. Il détermine le modèle de DSF et ne se déduit pas du régime fiscal.",
      en: "Accounting framework not recorded. It determines the DSF template and does not follow from the tax regime.",
    });
  }

  if (tp.tax_regime && !tp.accounting_framework) {
    out.push({
      code: "REGIME_WITHOUT_FRAMEWORK",
      severity: "advisory",
      fr: "Régime fiscal connu mais référentiel comptable absent : les deux sont indépendants et doivent être établis séparément.",
      en: "Tax regime known but accounting framework absent: the two are independent and must be established separately.",
    });
  }

  if (input.openRequests > 0) {
    out.push({
      code: "DOCS_OUTSTANDING",
      severity: "blocking",
      fr: `${input.openRequests} pièce(s) encore attendue(s). La préparation ne peut pas être approuvée sur un dossier incomplet.`,
      en: `${input.openRequests} document(s) still outstanding. Preparation cannot be approved on an incomplete file.`,
    });
  }

  // Rework measures our own clarity, not the client's diligence.
  if (input.returnedRequests > 0 || d.returned_count > 1) {
    out.push({
      code: "REWORK_HIGH",
      severity: "advisory",
      fr: "Des pièces ont été retournées plus d'une fois. Vérifiez la formulation de la demande avant de relancer le client.",
      en: "Documents were returned more than once. Check how the request was worded before chasing the client again.",
    });
  }

  if (!d.reviewer) {
    out.push({
      code: "NO_REVIEWER",
      severity: "blocking",
      fr: "Aucun réviseur assigné. Un réviseur qualifié doit approuver la déclaration.",
      en: "No reviewer assigned. A qualified reviewer must approve the declaration.",
    });
  } else if (d.prepared_by && d.reviewer.trim() === d.prepared_by.trim()) {
    out.push({
      code: "SELF_APPROVAL",
      severity: "blocking",
      fr: "Le réviseur est aussi le préparateur. Un cabinet individuel peut faire appel au pool de réviseurs Kima.",
      en: "The reviewer is also the preparer. A solo firm can route this to the Kima reviewer pool.",
    });
  }

  if (d.state === "awaiting_evidence" && !d.evidence_reference) {
    out.push({
      code: "EVIDENCE_MISSING",
      severity: "blocking",
      fr: "Transmise sans accusé de réception. Une déclaration n'est pas « déposée » tant que la preuve n'est pas au dossier.",
      en: 'Submitted with no acknowledgment. A declaration is not "filed" until the evidence is on record.',
    });
  }

  if (d.due_on < today && d.state !== "filed") {
    const days = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.due_on}T00:00:00Z`)) / 86_400_000,
    );
    out.push({
      code: "PAST_DUE",
      severity: "advisory",
      fr: `Échéance dépassée de ${days} jour(s).`,
      en: `Deadline passed ${days} day(s) ago.`,
    });
  }

  return out;
}

export const hasBlocking = (findings: Finding[]) => findings.some((f) => f.severity === "blocking");
