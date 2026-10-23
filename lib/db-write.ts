/**
 * Updates that cannot lie about having happened.
 *
 * PostgREST answers a PATCH matching zero rows with 200 and an empty body, and
 * supabase-js reports NO ERROR for it. Under the capability-scoped write
 * policies that is the ordinary shape of a refusal: an actor without the
 * capability simply has no rows to update. A component checking only `error`
 * would show a client their document as sent, or an accountant their case as
 * advanced, while the database changed nothing.
 *
 * Measured against the live project with the publishable key: an anonymous
 * PATCH on `compliance_cases` returned HTTP 200 and left `blocker` untouched.
 *
 * So every update goes through here, asks for the changed rows back, and reads
 * "no rows" as a refusal. Inserts do not need this — an insert that violates a
 * policy raises a real error.
 *
 * Callers: components/live/case-detail.tsx (stage moves, settling a document,
 * toggling a task) and components/live/client-dashboard.tsx (sending a
 * document). `lib/commands.ts` stays pure by design and does no I/O.
 */

import { supabase } from "./supabase";

export type WriteOutcome =
  | { ok: true }
  /** The row exists but this actor may not change it, or it moved under us. */
  | { ok: false; reason: "not_permitted" }
  | { ok: false; reason: "error"; detail: string };

/**
 * Update one row by id, and prove it changed.
 *
 * `select("id")` is what makes the refusal visible: it asks PostgREST to hand
 * back what it wrote.
 */
export async function updateById(
  table: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<WriteOutcome> {
  try {
    const { data, error } = await supabase().from(table).update(patch).eq("id", id).select("id");
    if (error) return { ok: false, reason: "error", detail: error.message };
    if (!data || data.length === 0) return { ok: false, reason: "not_permitted" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Update several rows by id and prove every one changed.
 *
 * A short result means at least one row was invisible to this actor. Callers
 * must treat that as a refusal, not as a partial success.
 */
export async function updateManyById(
  table: string,
  ids: string[],
  patch: Record<string, unknown>,
): Promise<WriteOutcome> {
  if (ids.length === 0) return { ok: true };
  try {
    const { data, error } = await supabase()
      .from(table)
      .update(patch)
      .in("id", ids)
      .select("id");
    if (error) return { ok: false, reason: "error", detail: error.message };
    if (!data || data.length !== ids.length) return { ok: false, reason: "not_permitted" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : "unknown" };
  }
}
