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
