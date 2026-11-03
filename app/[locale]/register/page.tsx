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
  // Public /register stays unchanged. A firm application takes the same path as
  // any other: a private registrations row that only KIMA can read, which the
  // admin queue and route_unassigned_registration() already act on.
  //
  // The OTP preview flow (KIMA_FIRM_SIGNUP_PREVIEW=1, local or Vercel preview
  // only) is still a mock and is chosen first when enabled. Before this branch,
  // the firm plan was offered and the route 404'd whenever the flag was absent.
  if (searchParams?.type === "accounting_firm") {
    const preview =
      process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview";
    if (preview && process.env.KIMA_FIRM_SIGNUP_PREVIEW === "1") {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const isolated = Boolean(url && !url.includes("vhrnrbnjhmxrygvyfirf"));
      const staging = isolated && process.env.KIMA_FIRM_SIGNUP_STAGING === "1";
      return <FirmSignupFlow locale={locale} mode={staging ? "staging" : "demo"} />;
    }
    return (
      <OnboardingFlow
        locale={locale}
        copy={getPublicCopy(locale)}
        initialKind="accounting_firm"
      />
    );
  }
  return (
    <OnboardingFlow locale={locale} copy={getPublicCopy(locale)} initialKind={searchParams?.type} />
  );
}
