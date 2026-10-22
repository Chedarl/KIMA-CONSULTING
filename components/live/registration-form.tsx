"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { TAXPAYER_TYPES, type TaxpayerType } from "@/lib/rules";
import {
  EMPTY_DRAFT,
  INTAKE_CHANNELS,
  canSubmit,
  completeness,
  normaliseNiu,
  type RegistrationDraft,
} from "@/lib/registration";

/**
 * The public front door — MVP 1's assisted onboarding.
 *
 * Three things about this form are deliberate and easy to undo by accident.
 *
 * THE INTAKE PATHS ARE EQUALLY WEIGHTED. WhatsApp and walking into an office
 * are not fallbacks for people who failed at the web form. In a market where
 * most connectivity is mobile and much of the paperwork is paper, they are the
 * normal way in. Styling them as lesser options would quietly exclude the
 * clients this product exists to reach.
 *
 * NOTHING IS ASKED THAT THE VISITOR CANNOT ANSWER. No tax regime, no tax
 * centre. Those drive obligations and deadlines, and a confident wrong answer
 * is worse than no answer: it would travel downstream as though someone had
 * checked it. Establishing them is the reviewer's job, and the form says so.
 *
 * AN INCOMPLETE APPLICATION IS ACCEPTED. The completeness meter is advisory —
 * it orders the firm's triage queue. A name and a phone number is a better
 * outcome than a perfect form nobody filled in, because the person without a
 * NIU is often exactly the person who needs help getting one.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>;

export function RegistrationForm({
  locale,
  t,
  signInHref,
}: {
  locale: "fr" | "en";
  t: Dict["register"];
  signInHref: string;
}) {
  const [draft, setDraft] = useState<RegistrationDraft>({
    ...EMPTY_DRAFT,
    preferred_language: locale,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = <K extends keyof RegistrationDraft>(key: K, value: RegistrationDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const score = useMemo(() => completeness(draft), [draft]);
  const ready = canSubmit(draft);
  const isBusiness = draft.taxpayer_type.startsWith("business");

  async function submit() {
    if (!ready) {
      setError(t.needName);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const db = supabase();
      // Insert only. The anon policy allows no select, so nothing about any
      // other applicant can be read back through this form.
      const { error: err } = await db.from("registrations").insert({
        applicant_name: draft.applicant_name.trim(),
        applicant_email: draft.applicant_email.trim() || null,
        applicant_phone: draft.applicant_phone.trim() || null,
        taxpayer_type: draft.taxpayer_type,
        legal_name: isBusiness ? draft.legal_name.trim() || null : null,
        // Stored normalised so it can be compared with the sign-in identifier,
        // and named `declared_` because that is all it is until a reviewer
        // checks it against the official register.
        declared_niu: draft.declared_niu.trim() ? normaliseNiu(draft.declared_niu) : null,
        intake_channel: draft.intake_channel,
        preferred_language: draft.preferred_language,
      });
      if (err) throw err;
      setDone(true);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) =>
    `min-h-[44px] rounded-lg border px-3 text-sm transition-colors ${
      active
        ? "border-navy bg-navy font-semibold text-surface"
        : "border-border text-fg-muted hover:bg-surface-sunken"
    }`;

  const field =
    "min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg";

  if (done) {
    return (
      <div className="rise-in spotlight rounded-card border border-border bg-surface p-6 text-center shadow-raised">
        <p className="font-display text-xl font-semibold text-teal-text">{t.doneTitle}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-muted">
          {t.doneBody}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={signInHref}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 text-sm font-semibold text-surface hover:bg-navy-strong"
          >
            {t.signIn}
          </a>
          <button
            type="button"
            onClick={() => {
              setDraft({ ...EMPTY_DRAFT, preferred_language: locale });
              setDone(false);
            }}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken"
          >
            {t.doneAgain}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5 shadow-raised sm:p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-fg">{t.title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t.intro}</p>
      </div>

      {/* Who ------------------------------------------------------------- */}
      <fieldset>
        <legend className="text-sm font-medium text-fg">{t.whoTitle}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAXPAYER_TYPES.map((ty) => (
            <button
              key={ty.key}
              type="button"
              onClick={() => set("taxpayer_type", ty.key as TaxpayerType)}
              aria-pressed={draft.taxpayer_type === ty.key}
              className={chip(draft.taxpayer_type === ty.key)}
            >
              {locale === "fr" ? ty.fr : ty.en}
            </button>
          ))}
        </div>
        {draft.taxpayer_type !== "" && (
          <p className="mt-2 text-xs text-fg-subtle">
            {(() => {
              const ty = TAXPAYER_TYPES.find((x) => x.key === draft.taxpayer_type);
              return ty ? (locale === "fr" ? ty.helpFr : ty.helpEn) : null;
            })()}
          </p>
        )}
      </fieldset>

      {/* How — the paths, equally weighted ------------------------------- */}
      <fieldset>
        <legend className="text-sm font-medium text-fg">{t.howTitle}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {INTAKE_CHANNELS.map((c) => {
            const active = draft.intake_channel === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => set("intake_channel", c.key)}
                aria-pressed={active}
                className={`min-h-[44px] rounded-lg border p-3 text-left transition-colors ${
                  active ? "border-navy bg-navy-soft" : "border-border hover:bg-surface-sunken"
                }`}
              >
                <span className="block text-sm font-semibold text-fg">
                  {locale === "fr" ? c.fr : c.en}
                </span>
                <span className="mt-0.5 block text-xs text-fg-muted">
                  {locale === "fr" ? c.helpFr : c.helpEn}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Details ---------------------------------------------------------- */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-fg">{t.detailsTitle}</legend>

        <div>
          <label htmlFor="reg-name" className="text-sm text-fg">
            {isBusiness ? t.nameBusiness : t.name}
          </label>
          <input
            id="reg-name"
            type="text"
            autoComplete="name"
            value={draft.applicant_name}
            onChange={(e) => set("applicant_name", e.target.value)}
            className={`mt-1 ${field}`}
          />
        </div>

        {isBusiness && (
          <div className="rise-in">
            <label htmlFor="reg-legal" className="text-sm text-fg">
              {t.legalName}
            </label>
            <input
              id="reg-legal"
              type="text"
              value={draft.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
              className={`mt-1 ${field}`}
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="reg-phone" className="text-sm text-fg">
              {t.phone}
            </label>
            <input
              id="reg-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={draft.applicant_phone}
              onChange={(e) => set("applicant_phone", e.target.value)}
              className={`mt-1 ${field}`}
            />
            <p className="mt-1 text-xs text-fg-subtle">{t.phoneHint}</p>
          </div>
          <div>
            <label htmlFor="reg-email" className="text-sm text-fg">
              {t.email}
            </label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={draft.applicant_email}
              onChange={(e) => set("applicant_email", e.target.value)}
              className={`mt-1 ${field}`}
            />
            <p className="mt-1 text-xs text-fg-subtle">{t.emailHint}</p>
          </div>
        </div>

        <div>
          <label htmlFor="reg-niu" className="text-sm text-fg">
            {t.niu}
          </label>
          <input
            id="reg-niu"
            type="text"
            spellCheck={false}
            autoCapitalize="characters"
            value={draft.declared_niu}
            onChange={(e) => set("declared_niu", e.target.value)}
            className={`mt-1 font-mono tracking-wide ${field}`}
          />
          <p className="mt-1 text-xs text-fg-subtle">{t.niuHint}</p>
        </div>

        <div>
          <span className="text-sm text-fg">{t.language}</span>
          <div className="mt-2 flex gap-2">
            {(["fr", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => set("preferred_language", l)}
                aria-pressed={draft.preferred_language === l}
                className={chip(draft.preferred_language === l)}
              >
                {l === "fr" ? "Français" : "English"}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      {/* What we are NOT asking, and why --------------------------------- */}
      <div className="rounded-lg border border-border bg-surface-sunken p-3">
        <p className="text-xs leading-relaxed text-fg-muted">{t.noRegimeAsked}</p>
        <p className="mt-2 text-xs leading-relaxed text-amber-text">{t.unverified}</p>
      </div>

      {/* Completeness — advisory, never a gate --------------------------- */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {t.completeness}
          </span>
          <span className="tnum font-mono text-sm font-semibold text-fg">{score.score}%</span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
          role="presentation"
        >
          <div
            className="h-full rounded-full bg-teal transition-[width] duration-300"
            style={{ width: `${score.score}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-fg-subtle">{t.completenessHint}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="min-h-[44px] rounded-lg bg-navy px-4 text-sm font-semibold text-surface hover:bg-navy-strong disabled:opacity-60"
      >
        {busy ? t.submitting : t.submit}
      </button>

      <p className="border-t border-border pt-3 text-center text-xs text-fg-subtle">
        {t.haveAccount}{" "}
        <a href={signInHref} className="font-semibold text-navy underline">
          {t.signIn}
        </a>
      </p>
    </div>
  );
}
