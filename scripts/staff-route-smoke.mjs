import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const page = readFileSync(fileURLToPath(new URL("../app/[locale]/workspace/staff/page.tsx", import.meta.url)), "utf8");
// The rail is described by lib/workspace-nav.ts, not hand-written in the
// layout, so reachability is asserted against that module.
const nav = readFileSync(fileURLToPath(new URL("../lib/workspace-nav.ts", import.meta.url)), "utf8");
assert.ok(page.includes("StaffWorkspace"), "staff route must render the guarded component");
assert.ok(page.includes("getWorkspaceDictionary"), "staff route must use locale copy");
assert.ok(nav.includes('"/staff"'), "staff route must be reachable from firm navigation");
console.log("staff route and navigation contract passed");
