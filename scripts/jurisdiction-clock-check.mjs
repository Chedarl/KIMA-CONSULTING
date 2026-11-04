/**
 * The jurisdiction clock answers the same thing wherever it runs.
 *
 * Run with: npm run test:clock
 *
 * This product is pre-rendered on a Vercel server in iad1 (UTC-5) and hydrated
 * in a browser in Douala (UTC+1). Anything that decided a date or an hour from
 * `new Date().getHours()` or `getTimezoneOffset()` therefore produced one
 * answer in the HTML and a different one in the browser. On the firm dashboard
 * that showed up on production as three React errors at once -- #425 text
 * mismatch, #418 hydration failed, #423 "the entire root will switch to client
 * rendering" -- so the whole workspace was being thrown away and re-rendered.
 *
 * It was also simply wrong: "overdue" was being counted against the server's
 * calendar, and a declaration due today in Douala is not due today in Virginia.
 * CLAUDE.md requires dates to be exact and time zones unambiguous.
 *
 * The test spawns itself under several zones rather than mutating process.env.TZ
 * in place, because Node caches the zone on first use and an in-process change
 * would prove nothing.
 */
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
// Two sides of the real problem, plus the extremes either way.
const ZONES = ["Africa/Douala", "America/New_York", "UTC", "Pacific/Kiritimati", "Pacific/Niue"];
const FIXED = "2026-11-04T03:30:00.000Z"; // 04:30 Douala, 23:30 previous day in New York

if (process.argv[2] === "--emit") {
  const { todayInDouala, daysAgoInDouala, hourInDouala } = await import("../lib/dates.ts");
  const at = new Date(FIXED);
  process.stdout.write(
    JSON.stringify({
      today: todayInDouala(at),
      weekAgo: daysAgoInDouala(7, at),
      hour: hourInDouala(at),
    }),
  );
  process.exit(0);
}

const results = ZONES.map((tz) => {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", self, "--emit"], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `child failed under TZ=${tz}: ${r.stderr}`);
  return [tz, JSON.parse(r.stdout)];
});

const [, baseline] = results[0];
let assertions = 0;

for (const [tz, got] of results) {
  assert.deepEqual(got, baseline, `the jurisdiction clock changed answer under TZ=${tz}`);
  assertions += 1;
  console.log(`ok  TZ=${tz.padEnd(20)} today=${got.today} weekAgo=${got.weekAgo} hour=${got.hour}`);
}

// And it is the Douala answer, not merely a consistent one. 03:30 UTC is 04:30
// in Douala on the 4th; in New York it is still 22:30 on the 3rd, so a helper
// that had drifted to the server's zone would fail both of these.
assert.equal(baseline.today, "2026-11-04", "today is not the Douala calendar date");
assert.equal(baseline.hour, 4, "the hour is not the Douala hour");
assert.equal(baseline.weekAgo, "2026-10-28", "a week ago is not the Douala calendar date");
assertions += 3;
console.log("ok  the shared answer is Douala's, not the runtime's");

console.log(`\n${assertions} assertions passed.`);
