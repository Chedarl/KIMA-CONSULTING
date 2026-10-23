import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ProfileBoard } from "@/components/client-portal/profile-board";

export default function ProfilePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <ProfileBoard locale={params.locale} />;
}
