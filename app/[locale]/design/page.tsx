import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import {
  Button,
  Card,
  Completeness,
  Money,
  PageHeading,
  StatusChip,
  Timeline,
} from "@/components/ui";
import type { StatusKind } from "@/lib/demo-data";

/**
 * Deliverable G, rendered. The written spec and this page are the same thing
 * seen two ways: if they disagree, this page is the one that is wrong.
 */

const brandColours: {
  name: string;
  token: string;
  hex: string;
  role: "text" | "fill" | "surface";
  contrast?: string;
}[] = [
  { name: "Navy", token: "--navy", hex: "#18243B", role: "text", contrast: "15.5:1" },
  { name: "Navy strong", token: "--navy-strong", hex: "#111929", role: "fill" },
  { name: "Navy soft", token: "--navy-soft", hex: "#E8EDF6", role: "surface" },
  { name: "Indigo", token: "--teal", hex: "#455DA8", role: "text", contrast: "6.2:1" },
  { name: "Indigo soft", token: "--teal-soft", hex: "#E9EEF8", role: "surface" },
  { name: "Success", token: "--success", hex: "#15803D", role: "text", contrast: "5.0:1" },
  { name: "Success tint", token: "--success-soft", hex: "#E8F5EC", role: "surface" },
  { name: "Amber", token: "--amber", hex: "#F59E0B", role: "fill", contrast: "2.1:1" },
  { name: "Amber text", token: "--amber-text", hex: "#92400E", role: "text", contrast: "7.0:1" },
  { name: "Dark text", token: "--fg", hex: "#142235", role: "text", contrast: "15.8:1" },
  { name: "Soft gray", token: "--surface-sunken", hex: "#EFF3F8", role: "surface" },
];

const statuses: StatusKind[] = [
  "confirmed",
  "awaitingReview",
  "draft",
  "estimated",
  "filed",
  // The state the product exists to surface: submitted, but unproven.
  "awaitingEvidence",
  "actionNeeded",
];

export default function DesignPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);

  return (
    <div className="flex flex-col gap-8">
      <PageHeading eyebrow={t.common.prototype} title={t.design.title} lede={t.design.intro} />

      {/* Official lockups. Each one sits on the background it is for. */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-fg">
          {locale === "fr" ? "Identité" : "Brand"}
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-fg-muted">
          {locale === "fr"
            ? "Signatures officielles. Couleur sur fond clair, blanc sur fond sombre, charbon avec l'accent or dans le A. Le produit dans l'interface est KIMA OS."
            : "Official lockups. Colour on light, white on dark, charcoal with the gold accent in the A. The product name in the interface is KIMA OS."}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#65748A]">
              {locale === "fr" ? "Couleur, fond clair" : "Colour, light background"}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-color.svg" alt="KIMA CONSULTING" width={751} height={228} className="h-auto w-full max-w-md" />
            <code className="tnum font-mono text-[11px] text-[#65748A]">
              public/brand/logo-color.svg
            </code>
          </Card>

          <Card className="flex flex-col gap-3 bg-[#0D1B2A] p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8496AD]">
              {locale === "fr" ? "Blanc, fond sombre" : "White, dark background"}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-white.svg" alt="KIMA CONSULTING" width={751} height={228} className="h-auto w-full max-w-md" />
            <code className="tnum font-mono text-[11px] text-[#8496AD]">
              public/brand/logo-white.svg
            </code>
          </Card>

          <Card className="flex flex-col gap-3 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#65748A]">
              {locale === "fr" ? "Charbon, fond clair" : "Charcoal, light background"}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-charcoal.svg" alt="KIMA CONSULTING" width={751} height={228} className="h-auto w-full max-w-md" />
            <code className="tnum font-mono text-[11px] text-[#65748A]">
              public/brand/logo-charcoal.svg
            </code>
          </Card>

          <Card className="flex flex-col gap-3 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {locale === "fr" ? "Icône d'application" : "App icon"}
            </p>
            <div className="flex items-end gap-4">
              {[64, 40, 28, 16].map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={s}
                  src="/brand/app-icon.svg"
                  alt={`${s}px`}
                  width={s}
                  height={s}
                  style={{ width: s, height: s }}
                />
              ))}
            </div>
            <code className="tnum font-mono text-[11px] text-fg-subtle">
              app/icon.svg · public/brand/app-icon.svg
            </code>
          </Card>
        </div>
      </section>

      {/* Colour — each swatch states whether it may carry text, and its ratio. */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-fg">{t.design.colours}</h2>
        <p className="mb-4 max-w-2xl text-sm text-fg-muted">
          {locale === "fr"
            ? "Indigo #455DA8 et success #15803D portent le texte sur blanc (6,2:1 et 5,0:1). Amber reste une couleur d'attention : sa variante foncée porte le texte. Les ratios sont mesurés sur la surface claire ; le thème sombre utilise des variantes distinctes."
            : "Indigo #455DA8 and success #15803D may carry text on white (6.2:1 and 5.0:1). Amber stays an attention colour: its darkened variant carries text. Ratios are measured against the light surface; dark mode uses its own variants."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brandColours.map((c) => (
            <Card key={c.token} className="flex items-center gap-3 p-3">
              <span
                className="h-12 w-12 shrink-0 rounded-lg border border-border"
                style={{ backgroundColor: c.hex }}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{c.name}</p>
                <p className="tnum font-mono text-xs text-fg-muted">{c.hex}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      c.role === "text"
                        ? "bg-teal-soft text-teal-text"
                        : c.role === "fill"
                          ? "bg-surface-sunken text-fg-muted"
                          : "bg-navy-soft text-navy"
                    }`}
                  >
                    {c.role === "text"
                      ? t.design.textColour
                      : c.role === "fill"
                        ? t.design.fillColour
                        : "surface"}
                  </span>
                  {c.contrast && <span className="tnum font-mono text-fg-subtle">{c.contrast}</span>}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Status honesty — the requirement that most shapes this interface. */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-fg">{t.design.statusHonesty}</h2>
        <p className="mb-4 max-w-2xl text-sm text-fg-muted">{t.design.statusHonestyBody}</p>
        <Card>
          <ul className="divide-y divide-border">
            {statuses.map((s) => (
              <li key={s} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="w-44">
                  <StatusChip kind={s} locale={locale} />
                </span>
                <span className="text-sm text-fg-muted">{t.status[`${s}Help`]}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Typography */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-fg">{t.design.typography}</h2>
        <p className="mb-4 max-w-2xl text-sm text-fg-muted">
          IBM Plex Sans · IBM Plex Mono —{" "}
          {locale === "fr" ? "accents complets" : "full diacritics"}: àâçéèêëîïôùûü
        </p>
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-3xl font-bold tracking-tight text-fg">
            {locale === "fr" ? "Déclaration statistique et fiscale" : "Statistical and tax return"}
          </p>
          <p className="text-xl font-semibold text-fg">
            {locale === "fr" ? "Pièces manquantes" : "Missing documents"}
          </p>
          <p className="text-base text-fg">
            {locale === "fr"
              ? "Corps de texte : 16 px minimum, interligne confortable."
              : "Body text: 16px minimum, comfortable line height."}
          </p>
          <p className="text-sm text-fg-muted">
            {locale === "fr" ? "Texte secondaire, 14 px." : "Secondary text, 14px."}
          </p>
          <p className="tnum font-mono text-sm text-fg">7011781 · 412 · 2026-09 · 1 450 000</p>
        </Card>
      </section>

      {/* Money */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-fg">{t.design.money}</h2>
        <p className="mb-4 max-w-2xl text-sm text-fg-muted">{t.design.moneyBody}</p>
        <Card className="p-5">
          <table className="text-sm">
            <tbody>
              {[1450000, 486000, 72500].map((n) => (
                <tr key={n}>
                  <td className="py-1 pr-6 text-right">
                    <Money amount={n} locale={locale} />
                  </td>
                  <td className="py-1 text-xs text-fg-subtle">
                    {locale === "fr" ? "francs entiers" : "whole francs"}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-1 pr-6 text-right">
                  <Money amount={null} locale={locale} />
                </td>
                <td className="py-1 text-xs text-fg-subtle">
                  {locale === "fr" ? "aucune valeur — jamais zéro" : "no value — never zero"}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </section>

      {/* Components */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-fg">{t.design.components}</h2>
        <p className="mb-4 max-w-2xl text-sm text-fg-muted">{t.design.densityBody}</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col items-start gap-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {locale === "fr" ? "Actions" : "Actions"}
            </p>
            <Button href={`/${locale}/design`}>
              {locale === "fr" ? "Action principale" : "Primary action"}
            </Button>
            <Button href={`/${locale}/design`} variant="secondary">
              {locale === "fr" ? "Action secondaire" : "Secondary action"}
            </Button>
            <Button href={`/${locale}/design`} variant="quiet">
              {locale === "fr" ? "Action discrète" : "Quiet action"}
            </Button>
            <p className="text-xs text-fg-subtle">
              {locale === "fr" ? "Cible tactile 44 px minimum." : "44px minimum touch target."}
            </p>
          </Card>

          <Card className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {locale === "fr" ? "Complétude" : "Completeness"}
            </p>
            <div className="flex flex-col gap-2.5">
              <Completeness received={5} total={5} locale={locale} />
              <Completeness received={3} total={5} locale={locale} />
              <Completeness received={0} total={5} locale={locale} />
            </div>
            <p className="mt-3 text-xs text-fg-subtle">
              {locale === "fr"
                ? "Toujours un décompte, jamais un pourcentage seul."
                : "Always a count, never a bare percentage."}
            </p>
          </Card>

          <Card className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {locale === "fr" ? "Avancement client" : "Client progress"}
            </p>
            <Timeline
              locale={locale}
              steps={[
                { label: locale === "fr" ? "Pièces reçues" : "Documents received", state: "done" },
                { label: locale === "fr" ? "En préparation" : "In preparation", state: "current" },
                { label: locale === "fr" ? "Déposé" : "Filed", state: "todo" },
              ]}
            />
          </Card>
        </div>
      </section>
    </div>
  );
}
