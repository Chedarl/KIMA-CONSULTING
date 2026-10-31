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
    // Firm choice is optional (owner decision, 31 Oct 2026). An application
    // without one is stored unassigned: RLS keeps it invisible to every
    // firm, held for explicit routing — never silently assigned.
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
