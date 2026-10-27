import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getPublicCopy } from "@/lib/i18n-public";
import { OnboardingFlow } from "@/components/marketing/onboarding-flow";

/**
 * Public onboarding. Creates a private application row, not an approved file.
 */
export default function RegisterPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: { type?: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  return (
    <OnboardingFlow locale={locale} copy={getPublicCopy(locale)} initialKind={searchParams?.type} />
  );
}
