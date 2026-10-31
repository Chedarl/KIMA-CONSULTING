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

console.log("ok unassigned routing list is vendor-admin only");
