import Link from "next/link";
import { ContactForm } from "@/components/marketing/contact-form";
import { MarketingHeader } from "@/components/marketing/header";
import { ServiceIcon, type ServiceIconName } from "@/components/marketing/icons";
import { getPublicCopy, type PublicLocale } from "@/lib/i18n-public";
import { OPEN_WORKSPACE_KINDS } from "@/lib/public-onboarding";

const SERVICE_ICONS: ServiceIconName[] = ["tax", "dsf", "accounting", "calendar", "expert"];

export function HomePage({ locale }: { locale: PublicLocale }) {
  const copy = getPublicCopy(locale);
  const t = copy.home;
  const start = `/${locale}/register`;

  return (
    <>
      <MarketingHeader locale={locale} labels={copy.header} ctaHref={start} />
      <main id="main">
        <section className="relative overflow-hidden bg-[#0D1B2A] text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            aria-hidden="true"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.04) 0 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
            <div>
              <h1 className="max-w-xl font-display text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.25rem]">
                {t.heroTitle}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">{t.heroBody}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={start} className="public-cta inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 text-sm font-semibold">
                  {t.getStarted}
                  <span aria-hidden="true">→</span>
                </Link>
                <a
                  href="#how"
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-white/70 px-5 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {t.watch}
                </a>
              </div>
            </div>
            <div className="relative min-h-[240px] lg:min-h-[420px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/marketing/hero.jpg"
                alt={t.heroAlt}
                width={1280}
                height={720}
                className="hero-photo h-full max-h-[520px] w-full object-cover object-[center_20%]"
              />
            </div>
          </div>
        </section>

        <section id="services" className="scroll-mt-24 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <h2 className="sr-only">{t.servicesTitle}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {t.services.map((service, i) => (
                <li key={service.title}>
                  <article className="flex h-full flex-col items-center rounded-card border border-border bg-white px-4 py-6 text-center shadow-card transition hover:border-teal/40 hover:shadow-raised">
                    <span className="text-teal-text">
                      <ServiceIcon name={SERVICE_ICONS[i] ?? "tax"} />
                    </span>
                    <h3 className="mt-3 font-display text-sm font-semibold text-fg">{service.title}</h3>
                    <p className="mt-1 text-xs text-fg-muted">{service.body}</p>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 border-t border-border bg-[#F7F9FB]">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="font-display text-3xl font-bold text-fg">{t.howTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm text-fg-muted">{t.howIntro}</p>
            <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {t.how.map((step, i) => (
                <li key={step.title} className="rounded-card border border-border bg-white p-5">
                  <p className="font-mono text-xs font-semibold text-teal-text">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 font-display text-base font-semibold text-fg">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="font-display text-3xl font-bold text-fg">{t.pricingTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm text-fg-muted">{t.pricingIntro}</p>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {OPEN_WORKSPACE_KINDS.map((kind, i) => {
                const plan = t.pricing[i];
                return (
                  <li key={plan.title} className="flex flex-col rounded-card border border-border bg-white p-6 shadow-card">
                    <h3 className="font-display text-xl font-semibold text-fg">{plan.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">{plan.body}</p>
                    <Link
                      href={`${start}?type=${kind}`}
                      className="public-cta mt-6 inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-semibold"
                    >
                      {plan.cta}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="about" className="scroll-mt-24 border-t border-border bg-[#F7F9FB]">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h2 className="font-display text-3xl font-bold text-fg">{t.aboutTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{t.aboutBody}</p>
              <p className="mt-4 font-display text-lg font-semibold text-navy">{t.aboutTagline}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {t.aboutPoints.map((point) => (
                <li key={point} className="rounded-card border border-border bg-white px-4 py-3 text-sm leading-relaxed text-fg">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="resources" className="scroll-mt-24 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="font-display text-3xl font-bold text-fg">{t.resourcesTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm text-fg-muted">{t.resourcesIntro}</p>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {t.resources.map((item) => (
                <li key={item.title} className="rounded-card border border-border p-5">
                  <h3 className="font-display text-base font-semibold text-fg">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="contact" className="scroll-mt-24 border-t border-border bg-[#F7F9FB]">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-bold text-fg">{t.contactTitle}</h2>
              <p className="mt-2 text-sm text-fg-muted">{t.contactIntro}</p>
              <ul className="mt-6 flex flex-col gap-2 text-sm font-medium text-fg">
                <li className="flex min-h-[44px] items-center gap-2">
                  <span className="text-teal-text"><ServiceIcon name="whatsapp" /></span>
                  {t.channels.whatsapp}
                </li>
                <li className="flex min-h-[44px] items-center gap-2">
                  <span className="text-teal-text"><ServiceIcon name="phone" /></span>
                  {t.channels.callback}
                </li>
                <li className="flex min-h-[44px] items-center gap-2">
                  <span className="text-teal-text"><ServiceIcon name="pin" /></span>
                  {t.channels.office}
                </li>
              </ul>
            </div>
            <div className="rounded-card border border-border bg-white p-5 shadow-card">
              <ContactForm locale={locale} copy={copy} />
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="font-display text-sm font-semibold text-fg">KIMA CONSULTING</p>
          <p className="mt-1 text-sm text-fg-muted">{t.aboutTagline}</p>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-fg-subtle">{copy.footer.disclaimer}</p>
        </div>
      </footer>
    </>
  );
}
