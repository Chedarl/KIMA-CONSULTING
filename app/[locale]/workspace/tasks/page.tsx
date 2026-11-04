import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/**
 * Tasks are folded into the workflows board: the board is the work surface, and a task's detail lives on its case record.
 *
 * The route stays as a redirect rather than a 404: an old bookmark or a link in
 * a colleague's message must land somewhere sensible, not on an error.
 */
export default function MovedPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) redirect("/fr");
  redirect(`/${params.locale}/workspace/workflows`);
}
