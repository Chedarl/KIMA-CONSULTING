import { supabase } from "@/lib/supabase";
import type { OnboardingDraft } from "@/lib/public-onboarding";

/** General inquiries never create unassigned accounting-firm applications. */
export async function submitKimaContact(draft: OnboardingDraft): Promise<"ok" | "failed"> {
  if (!["individual", "business"].includes(draft.kind)) return "failed";
  if (draft.name.trim().length < 2) return "failed";
  if (!draft.email.trim() && !draft.phone.trim()) return "failed";
  try {
    const { error } = await supabase().from("contact_inquiries").insert({
      contact_name: draft.name.trim(),
      contact_email: draft.email.trim() || null,
      contact_phone: draft.phone.trim() || null,
      inquiry_kind: draft.kind,
      preferred_language: draft.language,
      note: draft.note.trim() || null,
    });
    return error ? "failed" : "ok";
  } catch {
    return "failed";
  }
}
