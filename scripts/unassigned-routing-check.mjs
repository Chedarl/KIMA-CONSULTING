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

console.log("ok unassigned routing list is vendor-admin only");
