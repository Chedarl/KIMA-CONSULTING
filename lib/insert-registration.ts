import { supabase } from "@/lib/supabase";
import { registrationInsert, type OnboardingDraft } from "@/lib/public-onboarding";

/**
 * Insert a public application. If the workspace columns are not on this
 * database yet, retry with the columns the original registration form used
 * so the visitor is not blocked on a migration that has not landed.
 */
export async function insertRegistration(
  draft: OnboardingDraft,
  workspaceRef: string,
): Promise<"ok" | "failed"> {
  try {
    // Without an explicit receiving firm, the new RLS policy would make the
    // application invisible to every firm. Never silently assign one.
    if (!draft.firmId) return "failed";
    const row = registrationInsert(draft, workspaceRef);
    const db = supabase();
    const first = await db.from("registrations").insert(row.full);
    if (!first.error) return "ok";
    const second = await db.from("registrations").insert(row.base);
    return second.error ? "failed" : "ok";
  } catch {
    return "failed";
  }
}

/** A teammate invitation correlated by the client-generated workspace ref. */
export async function insertWorkspaceInvite(
  workspaceRef: string,
  email: string,
): Promise<"ok" | "failed"> {
  try {
    const { error } = await supabase()
      .from("workspace_invites")
      .insert({ workspace_ref: workspaceRef, email: email.trim().toLowerCase() });
    return error ? "failed" : "ok";
  } catch {
    return "failed";
  }
}
