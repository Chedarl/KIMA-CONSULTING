import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getPublicCopy } from "@/lib/i18n-public";
import { OnboardingFlow } from "@/components/marketing/onboarding-flow";
import { FirmSignupFlow } from "@/components/marketing/firm-signup-flow";

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
  // Public /register stays unchanged. Firm signup requires an explicit preview
  // flag and cannot be opened in a production Vercel deployment.
  if (searchParams?.type === "accounting_firm") {
    const preview = process.env.NODE_ENV === "development" ||
      process.env.VERCEL_ENV === "preview";
    if (!preview || process.env.KIMA_FIRM_SIGNUP_PREVIEW !== "1") notFound();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const isolated = Boolean(url && !url.includes("vhrnrbnjhmxrygvyfirf"));
    const staging = isolated && process.env.KIMA_FIRM_SIGNUP_STAGING === "1";
    return <FirmSignupFlow locale={locale} mode={staging ? "staging" : "demo"} />;
  }
  return (
    <OnboardingFlow locale={locale} copy={getPublicCopy(locale)} initialKind={searchParams?.type} />
  );
}
