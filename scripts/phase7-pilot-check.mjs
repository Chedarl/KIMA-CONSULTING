/** Phase 7 synthetic pilot scoring regression checks; no real participant data. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync("lib/phase7-pilot.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
runInNewContext(compiled, { exports });
const { assessPhase7Pilot: assess } = exports;
const trial = seconds => ({
  correctNextAction: true, completeEvidence: true,
  criticalWrongInstruction: false, falseCompletion: false,
  understandsUnresolved: true, elapsedSeconds: seconds,
});
const sample = {
  taxpayers: Array.from({ length: 6 }, (_, i) => ({
    consent: true, locale: i % 2 ? "en" : "fr",
    mobileOnly: true, throttledNetwork: i === 0,
    firstArm: i % 2 ? "guided" : "baseline",
    cases: ["F-2", "F-3", "F-4"].map(scenario => ({
      scenario, baseline: trial(180), guided: trial(90),
    })),
  })),
  firms: Array.from({ length: 5 }, (_, i) => ({
    consent: true, city: i % 2 ? "Yaoundé" : "Douala", testedWorkflow: true,
    measures: {
      documentCollectionMinutes: 40 + i, followUpMinutes: 15,
      overdueTasks: i === 0 ? 1 : 0, completionVisibility: true,
      willingToPay: i !== 4,
    },
  })),
};
const copy = () => structuredClone(sample);
const fail = (code, change) => {
  const input = copy();
  change(input);
  const outcome = assess(input);
  assert.equal(outcome.outcome, "not_met", `Expected failure: ${code}`);
  assert.ok(outcome.failures.includes(code),
    `Expected ${code}, got ${outcome.failures.join(", ")}`);
};
const result = assess(sample);
assert.equal(result.outcome, "criteria_met");
assert.equal(result.failures.length, 0);
assert.equal(result.metrics.taxpayers, 6);
assert.equal(result.metrics.firms, 5);
assert.equal(result.metrics.guidedTrials, 18);
assert.equal(result.metrics.nextActionPercent, 100);
assert.equal(result.metrics.evidencePercent, 100);
assert.equal(result.metrics.clarityPercent, 100);
assert.equal(result.metrics.baselineMeanSeconds, 180);
assert.equal(result.metrics.guidedMeanSeconds, 90);
assert.equal(result.metrics.firmWillingToPay, 4);
assert.equal(result.metrics.firmCompletionVisibilityPercent, 100);
assert.equal(result.metrics.firmOverdueTasksTotal, 1);
assert.equal(result.metrics.firmMeanDocumentCollectionMinutes, 42);
assert.equal(result.metrics.firmMeanFollowUpMinutes, 15);
assert.match(result.qualification, /not.*launch|independent security/i);
fail("taxpayer_sample_5_to_10", x => { x.taxpayers.length = 4; });
fail("firm_sample_at_least_5", x => { x.firms.length = 4; });
fail("taxpayer_consent_missing", x => { x.taxpayers[0].consent = false; });
fail("firm_consent_missing", x => { x.firms[0].consent = false; });
fail("mobile_only_not_met", x => { x.taxpayers[0].mobileOnly = false; });
fail("slow_network_missing", x => { x.taxpayers[0].throttledNetwork = false; });
fail("locale_coverage", x => { for (const p of x.taxpayers) p.locale = "fr"; });
fail("counterbalance_missing", x => { for (const p of x.taxpayers) p.firstArm = "guided"; });
fail("firm_city_coverage", x => { for (const f of x.firms) f.city = "Douala"; });
fail("firm_workflow_missing", x => { x.firms[0].testedWorkflow = false; });
fail("invalid_case_trials", x => { x.taxpayers[0].cases[1].scenario = "F-2"; });
fail("invalid_case_trials", x => { x.taxpayers[0].cases[1].guided.elapsedSeconds = -5; });
fail("next_action_below_90", x => {
  x.taxpayers[0].cases[0].guided.correctNextAction = false;
  x.taxpayers[1].cases[0].guided.correctNextAction = false;
});
fail("evidence_below_90", x => {
  x.taxpayers[0].cases[0].guided.completeEvidence = false;
  x.taxpayers[1].cases[0].guided.completeEvidence = false;
});
fail("clarity_below_80", x => {
  for (let i = 0; i < 4; i++) x.taxpayers[i].cases[0].guided.understandsUnresolved = false;
});
fail("critical_wrong_instruction", x => {
  x.taxpayers[0].cases[0].guided.criticalWrongInstruction = true;
});
fail("false_completion", x => { x.taxpayers[0].cases[0].guided.falseCompletion = true; });
fail("no_directional_time_improvement", x => {
  for (const p of x.taxpayers) for (const c of p.cases) c.guided.elapsedSeconds = 200;
});
// Bug 1 regression: a fast WRONG guided trial must not count as a speed
// improvement. 17 correct guided @180s + 1 wrong @1s vs 18 baseline @180s
// used to pass (mean 169.9 < 180); time-to-correct-action must reject it.
fail("no_directional_time_improvement", x => {
  for (const p of x.taxpayers) for (const c of p.cases) c.guided.elapsedSeconds = 180;
  const wrong = x.taxpayers[0].cases[0].guided;
  wrong.correctNextAction = false;
  wrong.elapsedSeconds = 1;
});
// Bug 1, fail closed: an arm with no successful trials has no time evidence.
fail("no_directional_time_improvement", x => {
  for (const p of x.taxpayers) for (const c of p.cases) {
    c.guided.correctNextAction = false;
    c.guided.elapsedSeconds = 1;
  }
});
// Bug 2 regression: rounding must not hide a real one-second total gain.
// Guided 17x180 + 1x179 (all correct) beats baseline 18x180 and must pass.
{
  const input = copy();
  for (const p of input.taxpayers) for (const c of p.cases) c.guided.elapsedSeconds = 180;
  input.taxpayers[0].cases[0].guided.elapsedSeconds = 179;
  const outcome = assess(input);
  assert.equal(outcome.outcome, "criteria_met",
    `Sub-second gain must survive: ${outcome.failures.join(", ")}`);
  assert.equal(outcome.metrics.guidedMeanSeconds, 180); // display rounding only
}
// Bug 2, other direction: an exact tie on unrounded sums must fail.
fail("no_directional_time_improvement", x => {
  for (const p of x.taxpayers) for (const c of p.cases) c.guided.elapsedSeconds = 180;
});
// Plan measures: missing firm measures are insufficient evidence, and a firm
// that cannot see completion state fails the product promise.
fail("firm_measures_missing", x => { delete x.firms[0].measures; });
fail("firm_measures_missing", x => { x.firms[1].measures.overdueTasks = -1; });
fail("firm_completion_not_visible", x => { x.firms[2].measures.completionVisibility = false; });
// No participant name, NIU or transaction reference is copied into the report.
const sensitive = copy();
sensitive.taxpayers[0].name = "NEVER-EXPORT-IDENTITY";
assert.ok(!JSON.stringify(assess(sensitive)).includes("NEVER-EXPORT-IDENTITY"));
assert.throws(() => assess({ taxpayers: null, firms: [] }), /arrays/);
assert.notEqual(assess({ taxpayers: [], firms: [] }).outcome, "criteria_met");
console.log("ok Phase 7: anonymous pilot scoring, safety and incomplete-sample cases");
