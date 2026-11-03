/**
 * OHADA account mapping for the DSF bridge.
 *
 * The rule is fixed by the product's hard constraints: codification stops at
 * four digits and a chart may legitimately extend past it (7011781 under root
 * 7011). Matching is longest-root first, 4 digits down to 1, and anything
 * unresolved is flagged for a human — never defaulted to a nearby account.
 */

export type AccountMapping = {
  code: string;
  root: string | null;
  schedule: string | null;
  status: "mapped" | "unmapped";
};

/** Digits only. Null for anything that cannot be an account. */
export function normaliseAccount(input: string): string | null {
  const digits = (input ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 0 || digits.length > 12) return null;
  return digits;
}

export function mapAccount(input: string, scheduleByRoot: Record<string, string>): AccountMapping {
  const code = normaliseAccount(input) ?? "";
  if (!code) return { code: "", root: null, schedule: null, status: "unmapped" };

  for (let length = Math.min(4, code.length); length >= 1; length--) {
    const candidate = code.slice(0, length);
    const schedule = scheduleByRoot[candidate];
    if (schedule) return { code, root: candidate, schedule, status: "mapped" };
  }

  return { code, root: null, schedule: null, status: "unmapped" };
}

export function mapAccounts(codes: string[], scheduleByRoot: Record<string, string>): AccountMapping[] {
  return codes.map((code) => mapAccount(code, scheduleByRoot));
}
