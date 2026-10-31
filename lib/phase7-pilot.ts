/**
 * Phase 7: anonymous, offline pilot acceptance scoring.
 *
 * Inputs contain ONLY aggregate trial outcomes for synthetic F-2/F-3/F-4
 * scenarios. Never collect NIUs, contacts, names, transaction details or
 * real taxpayer documents. This is NOT a production launch/security gate.
 */
export type PilotLocale = "fr" | "en";
export type PilotScenario = "F-2" | "F-3" | "F-4";
export type PilotTrial = {
  correctNextAction: boolean;
  completeEvidence: boolean;
  criticalWrongInstruction: boolean;
  falseCompletion: boolean;
  understandsUnresolved: boolean;
  elapsedSeconds: number;
};
export type PilotCase = { scenario: PilotScenario; baseline: PilotTrial; guided: PilotTrial };
export type PilotTaxpayer = {
  consent: boolean;
  locale: PilotLocale;
  mobileOnly: boolean;
  throttledNetwork: boolean;
  firstArm: "baseline" | "guided";
  cases: PilotCase[];
};
export type PilotFirmMeasures = {
  documentCollectionMinutes: number;
  followUpMinutes: number;
  overdueTasks: number;
  completionVisibility: boolean;
  willingToPay: boolean;
};
export type PilotFirm = {
  consent: boolean;
  city: "Douala" | "Yaoundé";
  testedWorkflow: boolean;
  /** Plan-mandated pilot measures. Absent or malformed = insufficient evidence. */
  measures?: PilotFirmMeasures;
};
export type PilotInput = { taxpayers: PilotTaxpayer[]; firms: PilotFirm[] };
export type PilotMetrics = {
  taxpayers: number;
  firms: number;
  guidedTrials: number;
  nextActionPercent: number;
  evidencePercent: number;
  clarityPercent: number;
  criticalErrors: number;
  falseCompletions: number;
  /** Mean time-to-correct-action over successful trials only; rounded for display. */
  baselineMeanSeconds: number;
  guidedMeanSeconds: number;
  firmMeanDocumentCollectionMinutes: number;
  firmMeanFollowUpMinutes: number;
  firmOverdueTasksTotal: number;
  firmCompletionVisibilityPercent: number;
  firmWillingToPay: number;
};
export type PilotAssessment = {
  outcome: "criteria_met" | "not_met";
  failures: string[];
  metrics: PilotMetrics;
  /** Never claim real-world efficacy or launch readiness from these scores. */
  qualification: "Pilot scoring only; independent security, deployment and field validation remain required.";
};
const requiredScenarios: PilotScenario[] = ["F-2", "F-3", "F-4"];
const percent = (count: number, n: number) => n ? Math.round((count / n) * 1000) / 10 : 0;
const mean = (values: number[]) => values.length
  ? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length)
  : 0;
/** The five measures the plan requires from every pilot firm. */
const firmMeasuresValid = (m?: PilotFirmMeasures): m is PilotFirmMeasures => !!m &&
  Number.isFinite(m.documentCollectionMinutes) && m.documentCollectionMinutes >= 0 &&
  Number.isFinite(m.followUpMinutes) && m.followUpMinutes >= 0 &&
  Number.isSafeInteger(m.overdueTasks) && m.overdueTasks >= 0 &&
  typeof m.completionVisibility === "boolean" &&
  typeof m.willingToPay === "boolean";

export function assessPhase7Pilot(input: PilotInput): PilotAssessment {
  if (!Array.isArray(input?.taxpayers) || !Array.isArray(input?.firms)) {
    throw new TypeError("Pilot inputs must contain taxpayer and firm arrays");
  }
  const failures: string[] = [];
  const taxpayers = input.taxpayers;
  const firms = input.firms;
  const flag = (condition: boolean, code: string) => {
    if (condition) failures.push(code);
  };
  flag(taxpayers.length < 5 || taxpayers.length > 10, "taxpayer_sample_5_to_10");
  flag(firms.length < 5, "firm_sample_at_least_5");
  flag(taxpayers.some(p => !p.consent), "taxpayer_consent_missing");
  flag(firms.some(f => !f.consent), "firm_consent_missing");
  flag(taxpayers.some(p => !p.mobileOnly), "mobile_only_not_met");
  flag(taxpayers.length > 0 && !taxpayers.some(p => p.throttledNetwork), "slow_network_missing");
  flag(!taxpayers.some(p => p.locale === "fr") || !taxpayers.some(p => p.locale === "en"), "locale_coverage");
  flag(!taxpayers.some(p => p.firstArm === "baseline") ||
    !taxpayers.some(p => p.firstArm === "guided"), "counterbalance_missing");
  flag(!firms.some(f => f.city === "Douala") || !firms.some(f => f.city === "Yaoundé"), "firm_city_coverage");
  flag(firms.some(f => !f.testedWorkflow), "firm_workflow_missing");
  // The plan's firm measures are mandatory evidence, not optional extras:
  // document-collection time, follow-up time, overdue tasks, completion
  // visibility and willingness to pay. Missing data fails closed.
  flag(firms.some(f => !firmMeasuresValid(f.measures)), "firm_measures_missing");
  flag(firms.some(f => f.measures?.completionVisibility === false), "firm_completion_not_visible");

  let malformed = false;
  const guided: PilotTrial[] = [];
  const baseline: PilotTrial[] = [];
  for (const person of taxpayers) {
    const cases = person.cases;
    if (!Array.isArray(cases) || cases.length !== 3 ||
      requiredScenarios.some(id => cases.filter(c => c?.scenario === id).length !== 1)) {
      malformed = true;
      continue;
    }
    for (const caseItem of cases) {
      for (const trial of [caseItem.baseline, caseItem.guided]) {
        if (!trial || !Number.isSafeInteger(trial.elapsedSeconds) ||
          trial.elapsedSeconds <= 0 || trial.elapsedSeconds > 7200 ||
          ["correctNextAction", "completeEvidence", "criticalWrongInstruction",
           "falseCompletion", "understandsUnresolved"].some(k =>
             typeof trial[k as keyof PilotTrial] !== "boolean")) malformed = true;
      }
      if (caseItem.baseline && caseItem.guided) {
        baseline.push(caseItem.baseline);
        guided.push(caseItem.guided);
      }
    }
  }
  flag(malformed || guided.length !== taxpayers.length * 3, "invalid_case_trials");
  const correct = guided.filter(t => t.correctNextAction).length;
  const complete = guided.filter(t => t.completeEvidence).length;
  const clear = guided.filter(t => t.understandsUnresolved).length;
  const critical = guided.filter(t => t.criticalWrongInstruction).length;
  const falseCompletions = guided.filter(t => t.falseCompletion).length;
  // Protocol: time-to-CORRECT-action. An incorrect trial proves nothing about
  // speed, so both arms filter to successful trials before any comparison.
  const guidedCorrect = guided.filter(t => t.correctNextAction);
  const baselineCorrect = baseline.filter(t => t.correctNextAction);
  const baselineMean = mean(baselineCorrect.map(t => t.elapsedSeconds));
  const guidedMean = mean(guidedCorrect.map(t => t.elapsedSeconds));
  flag(guided.length === 0 || correct / guided.length < 0.9, "next_action_below_90");
  flag(guided.length === 0 || complete / guided.length < 0.9, "evidence_below_90");
  flag(guided.length === 0 || clear / guided.length < 0.8, "clarity_below_80");
  flag(critical > 0, "critical_wrong_instruction");
  flag(falseCompletions > 0, "false_completion");
  // Compare unrounded sums via cross-multiplication: rounding the means first
  // hides sub-second improvements, and an arm with no successful trials fails
  // closed rather than borrowing a mean of zero.
  const guidedSeconds = guidedCorrect.reduce((sum, t) => sum + t.elapsedSeconds, 0);
  const baselineSeconds = baselineCorrect.reduce((sum, t) => sum + t.elapsedSeconds, 0);
  flag(guidedCorrect.length === 0 || baselineCorrect.length === 0 ||
    guidedSeconds * baselineCorrect.length >= baselineSeconds * guidedCorrect.length,
    "no_directional_time_improvement");

  const measuredFirms = firms.map(f => f.measures).filter(firmMeasuresValid);
  const firmMean = (pick: (m: PilotFirmMeasures) => number) =>
    mean(measuredFirms.map(pick));

  return {
    outcome: failures.length ? "not_met" : "criteria_met",
    failures,
    metrics: {
      taxpayers: taxpayers.length, firms: firms.length, guidedTrials: guided.length,
      nextActionPercent: percent(correct, guided.length),
      evidencePercent: percent(complete, guided.length),
      clarityPercent: percent(clear, guided.length),
      criticalErrors: critical, falseCompletions,
      baselineMeanSeconds: baselineMean, guidedMeanSeconds: guidedMean,
      firmMeanDocumentCollectionMinutes: firmMean(m => m.documentCollectionMinutes),
      firmMeanFollowUpMinutes: firmMean(m => m.followUpMinutes),
      firmOverdueTasksTotal: measuredFirms.reduce((sum, m) => sum + m.overdueTasks, 0),
      firmCompletionVisibilityPercent:
        percent(measuredFirms.filter(m => m.completionVisibility).length, firms.length),
      firmWillingToPay: measuredFirms.filter(m => m.willingToPay).length,
    },
    qualification: "Pilot scoring only; independent security, deployment and field validation remain required.",
  };
}
