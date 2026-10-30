import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { InvitationsPanel } from "@/components/live/invitations-panel";

export default function ClientInvitationsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <InvitationsPanel locale={params.locale} side="taxpayer" />;
}
