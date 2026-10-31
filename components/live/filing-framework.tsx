"use client";

import { useMemo, useState } from "react";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { Card, CardHeader } from "@/components/ui";
import type { Regime } from "@/lib/rules";
import {
  DOC_CLASSES,
  bucketsFor,
  buildReference,
  canonicalFilename,
  docClass,
  emptyBuckets,
  folderPath,
  parseReference,
  periodLabel,
  periodToken,
  suggestFromFilename,
  taxpayerCode,
  type DocClass,
  type Period,
} from "@/lib/document-naming";

/**
 * The filing framework, made visible.
 *
 * This surface exists because the framework is only persuasive when you watch
 * it work: choose a kind of document and a period, and the name and the folder
 * appear together. That is the whole idea — one grammar read in two directions.
 *
 * The folder tree is the part worth looking at twice. It is generated from
 * `obligationsFor`, so switching the regime switches the shape of the tree: a
 * réel client gets twelve monthly folders for purchase invoices, an IGS client
 * four quarterly ones and no VAT folders at all. Nobody is shown a folder for a
 * tax they do not pay, which is what makes an empty folder a finding rather
 * than noise.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>;

// A worked example, not real data. The practitioner's own clients do not appear
// on a page whose only purpose is explaining the system.
const SAMPLE_NAME = "ALUCAM SARL";
const SAMPLE_NIU = "P059812345678";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function FilingFramework({ locale, t }: { locale: "fr" | "en"; t: Dict["filing"] }) {
  const code = useMemo(() => taxpayerCode(SAMPLE_NAME, SAMPLE_NIU), []);

  const [cls, setCls] = useState<DocClass>("ACH");
  const [period, setPeriod] = useState<Period>({ kind: "month", year: 2026, month: 9 });
  const [typed, setTyped] = useState("");
  const [regime, setRegime] = useState<Regime>("reel");
  const [filename, setFilename] = useState("WhatsApp Image 2026-09-21 at 11.45.02.jpeg");

  const refParts = useMemo(
    () => ({ taxpayer: code, period, docClass: cls, sequence: 7 }),
    [code, period, cls],
  );
  const reference = useMemo(() => buildReference(refParts), [refParts]);

  // Split so the check character can be pointed at separately in the anatomy.
  const body = reference.slice(0, -1);
  const check = reference.slice(-1);

  const parsed = useMemo(() => (typed.trim() ? parseReference(typed) : null), [typed]);
  const typedButInvalid = typed.trim().length > 0 && !parsed;

  const buckets = useMemo(
    () => bucketsFor({ type: "business_moral", regime, year: 2026 }),
    [regime],
  );
  // Nothing is uploaded in a demonstration, so every chaseable bucket is empty —
  // which is precisely the behaviour being illustrated.
  const empties = useMemo(() => emptyBuckets(buckets, {}), [buckets]);

  const suggestion = useMemo(() => suggestFromFilename(filename), [filename]);
  const selected = docClass(cls);

  const pathParts = useMemo(() => {
    const bucket = buckets.find(
      (b) => b.docClass === cls && periodToken(b.period) === periodToken(period),
    );
    if (bucket) return folderPath(code, bucket, locale);
    // The chosen pair may not be a real bucket under this regime. Fall back to
    // the literal path rather than inventing a folder that would not exist.
    const label = selected ? (locale === "fr" ? selected.fr : selected.en) : cls;
    return [code, String(period.year), periodToken(period), `${cls} — ${label}`];
  }, [buckets, cls, period, code, locale, selected]);

  // Grouped by period so it reads like a folder listing.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof buckets>();
    for (const b of buckets) {
      const key = periodToken(b.period);
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()];
  }, [buckets]);

  const chip = (active: boolean) =>
    `min-h-[44px] rounded-lg border px-3 text-sm transition-colors ${
      active
        ? "border-navy bg-navy font-semibold text-surface"
        : "border-border text-fg-muted hover:bg-surface-sunken"
    }`;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Anatomy ------------------------------------------------------- */}
      <Card>
        <CardHeader title={t.anatomyTitle} />
        <div className="p-4 sm:p-5">
          <p className="text-sm text-fg-muted">{t.anatomyHint}</p>

          <div className="mt-4 overflow-x-auto">
            <code className="block whitespace-nowrap font-mono text-base font-semibold tracking-tight text-navy sm:text-lg">
              {body}
              <span className="rounded bg-amber-soft px-0.5 text-amber-text">{check}</span>
            </code>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { k: "KM", label: t.segMarker },
              { k: code, label: t.segTaxpayer, hint: t.segTaxpayerHint },
              { k: periodToken(period), label: t.segPeriod, hint: t.segPeriodHint },
              { k: cls, label: t.segClass },
              { k: "0007", label: t.segSeq },
              { k: check, label: t.segCheck, hint: t.segCheckHint },
            ].map((seg) => (
              <div key={seg.label} className="rounded-lg bg-surface-sunken px-3 py-2">
                <dt className="font-mono text-sm font-semibold text-fg">{seg.k}</dt>
                <dd className="mt-0.5 text-xs font-medium text-fg-muted">{seg.label}</dd>
                {seg.hint && <dd className="mt-1 text-xs text-fg-subtle">{seg.hint}</dd>}
              </div>
            ))}
          </dl>
        </div>
      </Card>

      {/* 2. Builder ------------------------------------------------------- */}
      <Card>
        <CardHeader title={t.builderTitle} />
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-fg-muted">{t.builderHint}</p>

            <fieldset>
              <legend className="text-sm font-medium text-fg">{t.classLabel}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {DOC_CLASSES.map((d) => (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => setCls(d.code)}
                    aria-pressed={d.code === cls}
                    title={locale === "fr" ? d.fr : d.en}
                    className={`${chip(d.code === cls)} font-mono`}
                  >
                    {d.code}
                  </button>
                ))}
              </div>
              {selected && (
                <p className="mt-2 text-xs text-fg-subtle">
                  <span className="font-medium text-fg-muted">
                    {locale === "fr" ? selected.fr : selected.en}
                  </span>{" "}
                  — {locale === "fr" ? selected.helpFr : selected.helpEn}
                </p>
              )}
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-fg">{t.periodLabel}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {MONTHS.map((m) => {
                  const active = period.kind === "month" && period.month === m;
                  return (
                    <button
                      key={`m${m}`}
                      type="button"
                      onClick={() => setPeriod({ kind: "month", year: 2026, month: m })}
                      aria-pressed={active}
                      className={`${chip(active)} min-w-[44px] px-2 font-mono text-xs`}
                    >
                      M{String(m).padStart(2, "0")}
                    </button>
                  );
                })}
                {[1, 2, 3, 4].map((q) => {
                  const active = period.kind === "quarter" && period.quarter === q;
                  return (
                    <button
                      key={`t${q}`}
                      type="button"
                      onClick={() => setPeriod({ kind: "quarter", year: 2026, quarter: q })}
                      aria-pressed={active}
                      className={`${chip(active)} min-w-[44px] px-2 font-mono text-xs`}
                    >
                      T{q}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPeriod({ kind: "year", year: 2026 })}
                  aria-pressed={period.kind === "year"}
                  className={`${chip(period.kind === "year")} font-mono text-xs`}
                >
                  2026A
                </button>
              </div>
              <p className="mt-2 text-xs text-fg-subtle">{periodLabel(period, locale)}</p>
            </fieldset>
          </div>

          <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-sunken p-4">
            {[
              { label: t.resultReference, value: reference },
              { label: t.resultFilename, value: canonicalFilename(refParts, "photo.jpg") },
            ].map((row) => (
              <div key={row.label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {row.label}
                </p>
                <p className="mt-1 break-all font-mono text-sm font-semibold text-navy">
                  {row.value}
                </p>
              </div>
            ))}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {t.resultFolder}
              </p>
              <ol className="mt-1 flex flex-col gap-0.5">
                {pathParts.map((part, i) => (
                  <li
                    key={part}
                    className="font-mono text-xs text-fg-muted"
                    style={{ paddingLeft: `${i * 12}px` }}
                  >
                    {i > 0 && (
                      <span aria-hidden="true" className="text-fg-subtle">
                        └{" "}
                      </span>
                    )}
                    {part}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Checker ------------------------------------------------------- */}
      <Card>
        <CardHeader title={t.checkerTitle} />
        <div className="p-4 sm:p-5">
          <p className="text-sm text-fg-muted">{t.checkerHint}</p>
          <div className="mt-3 flex flex-col gap-2 sm:max-w-xl">
            <label htmlFor="ref-check" className="sr-only">
              {t.checkerTitle}
            </label>
            <input
              id="ref-check"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t.checkerPlaceholder}
              spellCheck={false}
              autoCapitalize="characters"
              aria-invalid={typedButInvalid || undefined}
              className={`min-h-[44px] rounded-lg border bg-surface px-3 font-mono text-sm text-fg ${
                typedButInvalid ? "border-danger-text" : "border-border"
              }`}
            />
            {parsed && (
              <div
                role="status"
                className="rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-sm text-success-text"
              >
                <p className="font-semibold">{t.checkerValid}</p>
                <p className="mt-1 text-xs">
                  {periodLabel(parsed.period, locale)} ·{" "}
                  {(() => {
                    const d = docClass(parsed.docClass);
                    return d ? (locale === "fr" ? d.fr : d.en) : parsed.docClass;
                  })()}{" "}
                  · n° {String(parsed.sequence).padStart(4, "0")}
                </p>
              </div>
            )}
            {typedButInvalid && (
              <p role="alert" className="text-sm text-danger-text">
                {t.checkerInvalid}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* 4. The tree follows the obligations ------------------------------ */}
      <Card>
        <CardHeader title={t.treeTitle} />
        <div className="p-4 sm:p-5">
          <p className="text-sm text-fg-muted">{t.treeHint}</p>

          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-fg">{t.treeRegime}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["reel", "igs"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRegime(r)}
                  aria-pressed={regime === r}
                  className={chip(regime === r)}
                >
                  {r === "reel" ? "Réel" : "IGS"}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="mt-3 text-xs text-fg-subtle">
            <strong className="font-semibold text-fg-muted">{buckets.length}</strong>{" "}
            {t.treeFolders} ·{" "}
            <strong className="font-semibold text-amber-text">{empties.length}</strong>{" "}
            {locale === "fr" ? "à relancer" : "to chase"}
          </p>

          <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface-sunken p-3">
            <ol className="flex flex-col gap-2">
              {grouped.map(([token, items]) => (
                <li key={token}>
                  <p className="font-mono text-xs font-semibold text-fg">
                    {token}
                    <span className="ml-2 font-sans font-normal text-fg-subtle">
                      {periodLabel(items[0].period, locale)}
                    </span>
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5 pl-4">
                    {items.map((b) => (
                      <li
                        key={b.docClass}
                        className="flex flex-wrap items-center gap-2 text-xs text-fg-muted"
                      >
                        <span aria-hidden="true" className="text-fg-subtle">
                          └
                        </span>
                        <span className="font-mono">
                          {locale === "fr" ? b.folderFr : b.folderEn}
                        </span>
                        {b.firmRetrieved && (
                          <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[11px] font-medium text-teal-text">
                            {t.treeFirmRetrieved}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Card>

      {/* 5. Reading what the client actually sent ------------------------- */}
      <Card>
        <CardHeader title={t.readerTitle} />
        <div className="p-4 sm:p-5">
          <p className="text-sm text-fg-muted">{t.readerHint}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "WhatsApp Image 2026-09-21 at 11.45.02.jpeg",
              "IMG_20260921_114502.jpg",
              "Facture achat ALUCAM 2026-09.pdf",
              "Releve bancaire septembre.pdf",
              "scan0001.pdf",
            ].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilename(f)}
                aria-pressed={filename === f}
                className={`${chip(filename === f)} max-w-full truncate font-mono text-xs`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-card border border-border bg-surface-sunken p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {t.readerSuggestion}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {locale === "fr" ? suggestion.reasonFr : suggestion.reasonEn}
            </p>
            <dl className="mt-3 flex flex-wrap gap-4">
              <div>
                <dt className="text-xs text-fg-subtle">{t.segPeriod}</dt>
                <dd className="font-mono text-sm font-semibold text-fg">
                  {suggestion.period ? periodToken(suggestion.period) : t.readerNone}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">{t.segClass}</dt>
                <dd className="font-mono text-sm font-semibold text-fg">
                  {suggestion.docClass ?? t.readerNone}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      {/* 6. The principles ----------------------------------------------- */}
      <Card>
        <CardHeader title={t.principlesTitle} />
        <ol className="grid gap-4 p-4 sm:p-5 lg:grid-cols-3">
          {[
            { title: t.principleOneTitle, body: t.principleOneBody },
            { title: t.principleTwoTitle, body: t.principleTwoBody },
            { title: t.principleThreeTitle, body: t.principleThreeBody },
          ].map((p, i) => (
            <li key={p.title} className="rounded-lg bg-surface-sunken p-3">
              <p className="font-mono text-xs font-semibold text-teal-text">
                {String(i + 1).padStart(2, "0")}
              </p>
              <p className="mt-1 font-display text-sm font-semibold text-fg">{p.title}</p>
              <p className="mt-1 text-xs text-fg-muted">{p.body}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
