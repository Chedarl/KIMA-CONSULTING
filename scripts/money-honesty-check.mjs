import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// An unavailable figure is not zero. The firm dashboard's money tiles used to
// render `money?.billed ?? 0`, so a firm whose ledger had not loaded -- or
// whose load had just failed -- was shown "Facturé 0 XAF": a statement about
// its billing the dashboard had no basis for making. The panel's own offline
// line promises the opposite.
const src = readFileSync("components/live/firm-dashboard.tsx", "utf8");
const dict = readFileSync("lib/i18n-workspace.ts", "utf8");

for (const field of ["billed", "collected", "outstanding", "awaiting"]) {
  assert.ok(
    !src.includes("money?." + field + " ?? 0"),
    "money." + field + " must not coalesce an unknown figure to 0; render the unknown marker instead",
  );
  assert.ok(
    src.includes("money?." + field),
    "money." + field + " is no longer read; this check needs updating",
  );
}

assert.match(
  src,
  /s\.value === undefined \? \(/,
  "the money tiles must branch on an undefined figure rather than formatting it",
);

// The revenue KPI reads the same ledger and must not be the one place that
// still prints a zero.
assert.ok(
  !src.includes("revenue: money?.collected ?? 0"),
  "the revenue KPI must not coalesce an unknown figure to 0",
);
assert.match(
  src,
  /value=\{kpi\.revenue \?\? <UnknownFigure/,
  "the revenue KPI must fall back to the unknown marker",
);

// The marker is announced, not just drawn: an em dash alone tells a screen
// reader nothing. One component, so the tiles and the KPI cannot drift.
assert.match(src, /function UnknownFigure/, "the unknown marker must be one shared component");
assert.match(src, /aria-hidden="true">—</, "the dash must be hidden from assistive tech");
assert.match(src, /sr-only">\{label\}/, "the unknown figure must be announced");
const hits = dict.split("moneyUnknown:").length - 1;
assert.ok(hits >= 2, `moneyUnknown must exist in both the FR and EN dictionaries (found ${hits})`);

console.log("ok money honesty: an unavailable figure reads as unavailable, not as zero");
