import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Owner decision, 31 Oct 2026: choosing a receiving firm is optional at public
// onboarding. An unassigned application is held for explicit routing (OD-5 RLS
// keeps it invisible to every firm); it must never block or fail submission.
const lib = readFileSync("lib/public-onboarding.ts", "utf8");
const insert = readFileSync("lib/insert-registration.ts", "utf8");
const flow = readFileSync("components/marketing/onboarding-flow.tsx", "utf8");
const copy = readFileSync("lib/i18n-public.ts", "utf8");

assert.doesNotMatch(lib, /requireFirm/, "firm submit gate must be gone");
assert.doesNotMatch(lib, /\| "firm"/, "no firm onboarding issue kind");
assert.doesNotMatch(insert, /if \(!draft\.firmId\) return "failed"/, "no hard refusal without firm");
assert.match(insert, /held for explicit routing/, "unassigned consequence documented");
assert.doesNotMatch(flow, /issuesFor\(step, draft, true\)/);
assert.doesNotMatch(flow, /issuesFor\("verify", draft, true\)/);
assert.doesNotMatch(flow, /issues\.includes\("firm"\)/, "no firm error render");
assert.match(flow, /t\.firmLater/, "decide-later affordance present");
assert.match(flow, /firmState === "unavailable" && \(/);
assert.match(flow, /role="alert"/);
assert.match(flow, /text-danger-text">\{t\.firmDirectoryError\}/);
assert.match(flow, /firmState === "ready" && firms\.length === 0/);
assert.doesNotMatch(flow, /firmState === "unavailable" \|\|/, "a failed directory is not the empty-list note");
assert.match(copy, /firmDirectoryError: "Impossible de charger les cabinets/);
assert.match(copy, /firmDirectoryError: "The firm list could not be loaded/);
assert.match(copy, /firmLater: "Décider plus tard"/);
assert.match(copy, /firmLater: "Decide later"/);
assert.doesNotMatch(copy, /firm: "Choisissez un cabinet avant/);
assert.doesNotMatch(copy, /firm: "Choose a firm before/);

console.log("ok onboarding firm choice is optional");
