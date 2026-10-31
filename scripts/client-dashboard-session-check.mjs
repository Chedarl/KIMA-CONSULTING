import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-contract regression only: browser account-switch acceptance is still required.
const src = readFileSync("components/live/client-dashboard.tsx", "utf8");
assert.match(src, /auth\.onAuthStateChange\(/, "dashboard must track auth changes");
assert.match(src, /const epoch = \+\+loadEpoch\.current;/, "loads need a request epoch");
assert.equal((src.match(/if \(epoch !== loadEpoch\.current\) return;/g) ?? []).length, 3,
  "guard portal context, query results and load failures");
assert.match(src, /const epoch = authEpoch\.current;[\s\S]*?if \(epoch !== authEpoch\.current\) return;/,
  "uploads must be invalidated only by an auth change, not a realtime reload");

const authChange = src.split("auth.onAuthStateChange((event) => {")[1]?.split("\n    });")[0];
assert.ok(authChange, "auth change handler must exist");
for (const state of ["++loadEpoch.current", "++authEpoch.current", "setIds(null)", "setClientName(fallbackName)",
  "setCases(null)", "setRequests([])", "setBusy(null)", "setFailed(null)",
  "setJustSent(null)", "pending.current = null", 'fileRef.current.value = ""']) {
  assert.ok(authChange.includes(state), "auth change must clear " + state);
}
assert.match(src, /timer = setTimeout\(\(\) => \{ void load\(\); \}, 0\)/,
  "defer Supabase calls outside the auth callback");
assert.match(src, /subscription\.unsubscribe\(\)/, "unsubscribe on unmount");
assert.match(src, /setClientName\(who\?\.legal_name \?\? fallbackName\)/,
  "a missing client name must not retain the previous tenant");
assert.match(src, /if \(cs\.error \|\| rq\.error \|\| tp\.error\)/,
  "partial query failures must not show stale dashboard data");
console.log("ok: client dashboard auth-change and stale-response source contracts");
