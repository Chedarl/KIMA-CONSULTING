import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const list = readFileSync("components/live/unassigned-registrations.tsx", "utf8");
const link = readFileSync("components/live/vendor-routing-link.tsx", "utf8");
const layout = readFileSync("app/[locale]/workspace/layout.tsx", "utf8");

assert.match(list, /failure\.code === "42501"/);
assert.doesNotMatch(list, /administrator required/i);
assert.match(list, /Envoyée/);
assert.match(list, /Submitted/);
assert.match(list, /En ligne/);
assert.match(list, /Online/);
assert.match(list, /WhatsApp/);
assert.match(link, /list_unassigned_registrations/);
assert.match(link, /setVisible\(!error\)/);
assert.match(layout, /VendorRoutingLink/);
assert.doesNotMatch(layout, /href: `\$\{base\}\/routing`/);

// Auth lifecycle: old administrator data and navigation cannot survive sign-out,
// an account switch, or a late RPC response. Source contracts, not browser E2E.
assert.match(list, /auth\.onAuthStateChange/);
assert.match(list, /const request = \+\+epoch;/);
assert.match(list, /if \(!active \|\| request !== epoch\) return;/);
assert.match(list, /setRows\(nextUserId \? null : \[\]\)/);
assert.match(list, /setError\(nextUserId \? null : "denied"\)/);
assert.match(list, /subscription\.unsubscribe\(\)/);
assert.match(link, /auth\.onAuthStateChange/);
assert.match(link, /setVisible\(false\)/);
assert.match(link, /if \(!active \|\| request !== epoch\) return;/);
assert.match(link, /subscription\.unsubscribe\(\)/);
assert.match(list, /if \(nextUserId === identity\) return;/);
assert.match(link, /if \(nextUserId === identity\) return;/);


// Failure paths must also discard stale responses rather than displaying
// another administrator's applicant details after a switch or unmount.
assert.match(list, /catch \{\s*if \(!active \|\| request !== epoch\) return;/);
assert.match(list, /if \(failure\) \{\s*setRows\(\[\]\);/);
assert.match(list, /return \(\) => \{\s*active = false;\s*\+\+epoch;/);
assert.match(list, /if \(timer\) clearTimeout\(timer\);/);
assert.match(list, /if \(nextUserId\) load\(\);/);

// The 720px-wide queue must remain usable by keyboard on narrow FR/EN screens.
assert.match(list, /role="region"/);
assert.ok(list.includes("tabIndex={0}"));
assert.ok(list.includes('aria-label={fr ? "Tableau des demandes non attribuées, défilement horizontal" : "Unassigned applications table, horizontally scrollable"}'));
assert.match(list, /overflow-x-auto/);
assert.match(list, /focus-visible:outline/);

console.log("ok unassigned routing list is vendor-admin only");
