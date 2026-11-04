import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every stat tile says what it counts. The supplied design references put a
// delta under each label ("+12.5% from last month"); KIMA cannot draw one
// honestly without having read a prior period, so the second line is the
// figure's SCOPE instead. A tile without one is a number with no referent.
const src = readFileSync("components/live/firm-dashboard.tsx", "utf8");
const dict = readFileSync("lib/i18n-workspace.ts", "utf8");

const tileLines = src
  .split("\n")
  .map((line) => line.replace("\r", ""))
  .filter((line) => line.includes("<Kpi "));
assert.ok(tileLines.length >= 4, `expected the dashboard stat tiles, found ${tileLines.length}`);

for (const line of tileLines) {
  const label = line.match(/label=\{t\.(\w+)\}/);
  assert.ok(label, "a stat tile has no label: " + line.trim().slice(0, 60));
  assert.match(line, /scope=\{t\.\w+\}/, `the ${label[1]} tile must carry a scope line`);
  assert.match(
    line,
    /tone="(indigo|navy|amber|success)"/,
    `the ${label[1]} tile must carry a known tone`,
  );
}

// Tone pairs a -soft background with its -text foreground, and both flip in
// dark mode, so a tone that mixed families would pass light and fail dark.
const tones = src.match(/const KPI_TONES = \{([\s\S]*?)\} as const;/);
assert.ok(tones, "KPI_TONES is gone; this check needs updating");
for (const pair of tones[1].matchAll(/bg-([a-z]+)-soft text-([a-z-]+)/g)) {
  const family = pair[1];
  const fg = pair[2];
  assert.ok(
    fg === family || fg === family + "-text",
    `tone bg-${family}-soft must pair with its own foreground, not text-${fg}`,
  );
}

// Scope strings exist in both languages.
for (const hit of src.matchAll(/scope=\{t\.(\w+)\}/g)) {
  const key = hit[1];
  const found = dict.split(key + ":").length - 1;
  assert.ok(found >= 2, `${key} must exist in both the FR and EN dictionaries (found ${found})`);
}

// "Revenus" said nothing about whose revenue. A firm's fees and a taxpayer's
// tax are separate concepts, and the label has to carry the difference.
assert.ok(
  !dict.includes('kpiRevenue: "Revenus (YTD)"') && !dict.includes('kpiRevenue: "Revenue (YTD)"'),
  "the fees tile must not be labelled as generic revenue: firm fees and tax are not the same thing",
);

console.log(`ok stat tiles: ${tileLines.length} tiles, each with a tone and a scope`);
