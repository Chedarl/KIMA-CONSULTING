import Link from "next/link";
import { ContactForm } from "@/components/marketing/contact-form";
import { MarketingHeader } from "@/components/marketing/header";
import { KimaWordmark } from "@/components/marketing/wordmark";
import { ServiceIcon, type ServiceIconName } from "@/components/marketing/icons";
import { getPublicCopy, type PublicLocale } from "@/lib/i18n-public";
import { isOpenWorkspaceKind } from "@/lib/public-onboarding";

const SERVICE_ICONS: ServiceIconName[] = ["tax", "dsf", "accounting", "calendar", "expert"];

/**
 * Section rhythm: one eyebrow scale, one heading scale, one gutter. The page
 * reads as a sequence of the same three things rather than six experiments.
 */
const SECTION = "mx-auto max-w-6xl px-4 sm:px-6";

export function HomePage({ locale }: { locale: PublicLocale }) {
  const copy = getPublicCopy(locale);
  const t = copy.home;
  const start = `/${locale}/register`;

  return (
    <>
      <MarketingHeader locale={locale} labels={copy.header} ctaHref={start} />
      <main id="main">
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden bg-[#0D1B2A] text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            aria-hidden="true"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.05) 0 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-[#2E5E8C]/25 blur-3xl"
            aria-hidden="true"
          />
          <div className={`relative ${SECTION} grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24`}>
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D9A441]" aria-hidden="true" />
                Cameroun · CEMAC · XAF
              </p>
              <h1 className="mt-5 max-w-xl font-display text-[2.1rem] font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.35rem]">
                {t.heroTitle}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">{t.heroBody}</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href={start}
                  className="public-cta inline-flex min-h-[48px] items-center gap-2 rounded-xl px-6 text-sm font-semibold shadow-lg shadow-black/20 transition hover:-translate-y-0.5"
                >
                  {t.getStarted}
                  <span aria-hidden="true">→</span>
                </Link>
                <a
                  href="#how"
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-white/25 px-6 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/10"
                >
                  {t.watch}
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-2xl shadow-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/marketing/hero.jpg"
                  alt={t.heroAlt}
                  width={1280}
                  height={720}
                  className="hero-photo aspect-[16/11] w-full object-cover object-[center_20%]"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0D1B2A]/70 via-transparent to-transparent"
                  aria-hidden="true"
                />
              </div>
              <div className="absolute -bottom-4 left-4 hidden rounded-xl border border-white/15 bg-[#0D1B2A]/95 px-4 py-3 text-xs font-medium text-white/85 shadow-xl backdrop-blur sm:block">
                {locale === "fr"
                  ? "Un réviseur confirme le dossier avant qu'il devienne un espace ouvert."
                  : "A reviewer confirms the file before it becomes an open workspace."}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Services                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section id="services" className="scroll-mt-24 border-b border-border bg-white">
          <div className={`${SECTION} py-14`}>
            <h2 className="sr-only">{t.servicesTitle}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {t.services.map((service, i) => (
                <li key={service.title} className={i === t.services.length - 1 ? "sm:col-span-2 lg:col-span-3" : ""}>
                  <article className="group flex h-full items-start gap-4 rounded-2xl border border-border bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-raised">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal-text transition group-hover:bg-teal/15">
                      <ServiceIcon name={SERVICE_ICONS[i] ?? "tax"} />
                    </span>
                    <span className="min-w-0">
                      <h3 className="font-display text-base font-semibold text-fg">{service.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-fg-muted">{service.body}</p>
                    </span>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* How it works                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section id="how" className="scroll-mt-24 bg-[#F7F9FB]">
          <div className={`${SECTION} py-16`}>
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.howTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">{t.howIntro}</p>
            </div>
            <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {t.how.map((step, i) => (
                <li key={step.title} className="relative rounded-2xl border border-border bg-white p-5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#0D1B2A] font-mono text-xs font-semibold text-white">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 font-display text-base font-semibold text-fg">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Pricing                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section id="pricing" className="scroll-mt-24 border-y border-border bg-white">
          <div className={`${SECTION} py-16`}>
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.pricingTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">{t.pricingIntro}</p>
            </div>
            <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/*
                * Paired by kind, not by position. This used to walk
                * OPEN_WORKSPACE_KINDS and take t.pricing[i], which only worked
                * while the two arrays happened to start with the same two
                * entries in the same order — the third plan, the accounting
                * firm, was simply never reached. Flip the flag or reorder
                * either array and that renders one plan's words under another
                * plan's link.
                */}
              {t.pricing
                .filter((plan) => isOpenWorkspaceKind(plan.kind))
                .map((plan) => {
                const kind = plan.kind;
                return (
                  <li
                    key={plan.title}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-white p-6 transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-raised"
                  >
                    <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#2E5E8C] to-[#D9A441]" aria-hidden="true" />
                    <h3 className="font-display text-xl font-semibold text-fg">{plan.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">{plan.body}</p>
                    <Link
                      href={`${start}?type=${kind}`}
                      className="public-cta mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl px-4 text-sm font-semibold"
                    >
                      {plan.cta}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* About                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section id="about" className="scroll-mt-24 bg-[#F7F9FB]">
          <div className={`${SECTION} grid gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr]`}>
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.aboutTitle}</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg-muted sm:text-base">{t.aboutBody}</p>
              <p className="mt-5 font-display text-lg font-semibold text-navy">{t.aboutTagline}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {t.aboutPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm leading-relaxed text-fg"
                >
                  <span
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/10 text-[11px] font-bold text-teal-text"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Resources                                                         */}
        {/* ---------------------------------------------------------------- */}
        <section id="resources" className="scroll-mt-24 border-t border-border bg-white">
          <div className={`${SECTION} py-16`}>
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.resourcesTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">{t.resourcesIntro}</p>
            </div>
            <ul className="mt-10 grid gap-4 md:grid-cols-3">
              {t.resources.map((item) => (
                <li
                  key={item.title}
                  className="rounded-2xl border border-border p-5 transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-raised"
                >
                  <h3 className="font-display text-base font-semibold text-fg">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Contact                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section id="contact" className="scroll-mt-24 border-t border-border bg-[#F7F9FB]">
          <div className={`${SECTION} grid gap-10 py-16 lg:grid-cols-2`}>
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.contactTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">{t.contactIntro}</p>
              <ul className="mt-7 flex flex-col gap-2 text-sm font-medium text-fg">
                <li className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-white px-4">
                  <span className="text-teal-text"><ServiceIcon name="whatsapp" /></span>
                  {t.channels.whatsapp}
                </li>
                <li className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-white px-4">
                  <span className="text-teal-text"><ServiceIcon name="phone" /></span>
                  {t.channels.callback}
                </li>
                <li className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-white px-4">
                  <span className="text-teal-text"><ServiceIcon name="pin" /></span>
                  {t.channels.office}
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-6 shadow-card">
              <ContactForm locale={locale} copy={copy} />
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                             */}
      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-border bg-white">
        <div className={`${SECTION} py-10`}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link href={`/${locale}`} aria-label="KIMA CONSULTING" className="inline-flex">
                <KimaWordmark tone="dark" />
              </Link>
              <p className="mt-3 max-w-xs text-sm text-fg-muted">{t.aboutTagline}</p>
            </div>
            <nav aria-label={copy.header.mainNav}>
              <ul className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-1">
                <li><a href="#services" className="text-fg-muted hover:text-fg">{copy.header.services}</a></li>
                <li><a href="#pricing" className="text-fg-muted hover:text-fg">{copy.header.pricing}</a></li>
                <li><a href="#about" className="text-fg-muted hover:text-fg">{copy.header.about}</a></li>
                <li><a href="#contact" className="text-fg-muted hover:text-fg">{copy.header.contact}</a></li>
              </ul>
            </nav>
          </div>
          <p className="mt-8 max-w-3xl border-t border-border pt-6 text-xs leading-relaxed text-fg-subtle">
            {copy.footer.disclaimer}
          </p>
        </div>
      </footer>
    </>
  );
}
