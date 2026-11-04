import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The firm dashboard must never render a stale view. Two defects found on
// 4 Nov 2026 both produced one: a memo that ignored the filters, and a load
// failure that cleared only part of what it had loaded. Both are cheap to
// reintroduce by editing nearby code, so both are pinned here.
const src = readFileSync("components/live/firm-dashboard.tsx", "utf8");

// ---------------------------------------------------------------------------
// 1. The Kanban board is a view of the FILTERED rows.
//
// The pipeline memo builds its columns from filteredRows. It once declared
// [rows] as its dependency list, so changing the client, stage or risk filter
// recomputed filteredRows and left the board on the previous answer, while the
// list under it -- which reads filteredRows directly -- updated at once. Two
// halves of one screen, disagreeing about the same cases.
const memo = src.match(/const pipeline = useMemo\(([\s\S]*?)\n\s*\);/);
assert.ok(memo, "the pipeline memo is gone; this check needs updating");
assert.match(
  memo[1],
  /cases:\s*filteredRows\.filter/,
  "the pipeline columns must be built from filteredRows",
);
const deps = memo[1].match(/\[([^\]]*)\],\s*$/);
assert.ok(deps, "the pipeline memo must declare a dependency list");
assert.match(
  deps[1],
  /\bfilteredRows\b/,
  "the pipeline memo reads filteredRows, so it must depend on filteredRows - " +
    "depending on rows alone leaves the board on the previous filter",
);

// ---------------------------------------------------------------------------
// 2. A failed load clears everything it would have set.
//
// The catch block's own comment is the contract: "Nothing rather than stale
// numbers". It cleared rows only, so an outage emptied the case board while
// the money, the pending documents, the activity feed and the client names
// kept rendering their last good values - a firm with no work and a full
// ledger. Every server-derived slice must be reset.
//
// This file holds more than one catch and the first is a one-liner, so the
// load's handler is located from the state it sets, not by position.
const offlineAt = src.indexOf("setOffline(true)");
assert.ok(
  offlineAt > 0,
  "nothing sets offline; the dashboard load recovery is gone and this check needs updating",
);
const catchAt = src.lastIndexOf("} catch {", offlineAt);
assert.ok(catchAt > 0, "the offline reset is not inside a catch block");
const rest = src.slice(catchAt);
const close = ["\r\n    }", "\n    }"]
  .map((marker) => rest.indexOf(marker))
  .filter((at) => at > 0)
  .sort((a, b) => a - b)[0];
assert.ok(close, "could not find the end of the load catch block");
const recovery = rest.slice(0, close);

for (const reset of [
  "setRows([])",
  "setRequests({})",
  "setTasks({})",
  "setEvents([])",
  "setNames({})",
  "setMoney(null)",
  "setPendingDocs([])",
]) {
  assert.ok(
    recovery.includes(reset),
    `a failed dashboard load must clear every server-derived slice; missing ${reset}`,
  );
}

// User state is not server data: losing the filters or the saved views on one
// dropped request would be its own defect. Assert the recovery leaves them.
for (const kept of ["setClientQ", "setStageFilter", "setRiskFilter", "setSavedViews"]) {
  assert.ok(
    !recovery.includes(kept),
    `a failed load must keep the user's own ${kept} state, not reset it`,
  );
}

console.log("ok dashboard freshness: filtered board, and a failed load clears every loaded slice");
