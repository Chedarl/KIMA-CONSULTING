import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/**
 * Declarations are DSF work; the DSF screen is where they are prepared and reviewed.
 *
 * The route stays as a redirect rather than a 404: an old bookmark or a link in
 * a colleague's message must land somewhere sensible, not on an error.
 */
export default function MovedPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) redirect("/fr");
  redirect(`/${params.locale}/workspace/dsf`);
}
