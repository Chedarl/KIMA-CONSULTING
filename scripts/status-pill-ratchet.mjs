import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The old portal Pill takes a colour -- tone="green" -- so the call site
// decides what a state looks like. That is how a document that was merely
// RECEIVED comes to be painted the same green as one that was ACCEPTED, and
// how a payment reads as settled with no evidence behind it. CLAUDE.md
// forbids both of those readings.
//
// StatusPill replaces the colour vocabulary with a meaning vocabulary. The
// migration is finished: the old Pill is deleted and this is now a ban, so a
// colour-chosen pill cannot return.
const BUDGET = 0;

const roots = ["components", "app"];
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx$/.test(path)) files.push(path);
  }
};
for (const root of roots) walk(root);

const offenders = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const hits = src.match(/<Pill\b/g);
  if (hits) offenders.push({ file, count: hits.length });
}
const total = offenders.reduce((sum, o) => sum + o.count, 0);

assert.equal(
  total,
  0,
  `colour-chosen <Pill> count is ${total}; the old Pill is deleted. ` +
    "Use StatusPill with a tone that says what the state IS:\n" +
    offenders.map((o) => `  ${o.file}: ${o.count}`).join("\n"),
);

console.log(`ok status pill ratchet: ${total} colour-chosen pills left`);
