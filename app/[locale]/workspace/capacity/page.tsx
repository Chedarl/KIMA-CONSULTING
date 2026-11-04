import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/**
 * Capacity belongs with the team: one screen answers who the people are and how loaded they are.
 *
 * The route stays as a redirect rather than a 404: an old bookmark or a link in
 * a colleague's message must land somewhere sensible, not on an error.
 */
export default function MovedPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) redirect("/fr");
  redirect(`/${params.locale}/workspace/staff`);
}
