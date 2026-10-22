import { notFound } from "next/navigation";
import Link from "next/link";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { RegistrationForm } from "@/components/live/registration-form";

/**
 * The public application route — MVP 1's assisted onboarding.
 *
 * Like the sign-in page, this carries no navigation shell: someone who has not
 * applied yet has nowhere to navigate to, and every link away from here is a
 * chance to lose them.
 */
export default function RegisterPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-10 sm:px-6">
      <Link href={`/${locale}`} className="w-fit text-sm font-semibold text-navy hover:underline">
        Kima
      </Link>

      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <RegistrationForm locale={locale} t={w.register} signInHref={`/${locale}/login`} />
    </main>
  );
}
