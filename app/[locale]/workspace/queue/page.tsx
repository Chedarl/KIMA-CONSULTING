import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/**
 * The work queue and the board read the same rows; one surface is enough.
 *
 * The route stays as a redirect rather than a 404: an old bookmark or a link in
 * a colleague's message must land somewhere sensible, not on an error.
 */
export default function MovedPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) redirect("/fr");
  redirect(`/${params.locale}/workspace/workflows`);
}
