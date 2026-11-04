/**
 * The jurisdiction clock.
 *
 * Deadlines in this product are calendar dates in Cameroon, not instants in
 * the browser's zone. `lib/demo-data.ts` freezes "today" so a demonstration
 * cannot drift; live screens must not use that freeze.
 */

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` in Africa/Douala. */
export function todayInDouala(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The hour (0-23) in Africa/Douala.
 *
 * Same reason as `todayInDouala`: a greeting or a cut-off decided from
 * `new Date().getHours()` answers in whatever zone the code is running in, and
 * this product is pre-rendered on a server in another hemisphere. h23 is asked
 * for explicitly because `hour12: false` reports midnight as 24 on some
 * engines.
 */
export function hourInDouala(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Douala",
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
}

/** `YYYY-MM-DD` in Africa/Douala, `n` whole days before now. */
export function daysAgoInDouala(n: number, now = new Date()): string {
  return todayInDouala(new Date(now.getTime() - n * MS_PER_DAY));
}

/** Days until `iso`. Negative means overdue. Both arguments are date-only. */
export function daysUntil(iso: string, from: string): number {
  return Math.round(
    (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY,
  );
}

/** My Day bucketing, after the adopted PwC Connect pattern: overdue, today, within 7 days. */
export type DueBucket = "overdue" | "today" | "soon" | "later";

export function dueBucket(iso: string, from: string): DueBucket {
  const d = daysUntil(iso, from);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "soon";
  return "later";
}
