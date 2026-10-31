"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import type { getPublicCopy } from "@/lib/i18n-public";
import { regime as regimeDef, taxCentre as centreDef } from "@/lib/rules";
import { KimaWordmark } from "@/components/marketing/wordmark";
import {
  audienceMismatch,
  clearSession,
  formatTaxNumber,
  readSession,
  rememberSession,
  requestPortalCode,
  verifyPortalCode,
  type PortalAudience,
  type PortalSession,
} from "@/lib/portal-auth";

/**
 * Client sign-in. The screen matches the navy / card mockup.
 * The secret is a one-time code. There is no password field.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>;
type AuthCopy = ReturnType<typeof getPublicCopy>["auth"];

const inputClass =
  "mt-1.5 min-h-[48px] w-full rounded-lg border border-border bg-white px-3 text-sm text-fg";

export function PortalLogin({
  locale,
  t,
  auth,
  portalHref,
}: {
  locale: "fr" | "en";
  t: Dict["login"];
  auth: AuthCopy;
  portalHref: string;
}) {
  const [audience, setAudience] = useState<PortalAudience>("individual");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [masked, setMasked] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PortalSession | null>(null);

  useEffect(() => {
    const existing = readSession();
    if (existing) setSession(existing);
  }, []);

  async function requestCode() {
    setBusy(true);
    setError(null);
    const result = await requestPortalCode(name, number, locale);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === "incomplete"
          ? t.incomplete
          : result.reason === "not_configured"
            ? t.notConfigured
            : t.error,
      );
      return;
    }
    if (!result.reference) {
      setError(t.codeSentBlind);
      return;
    }
    setReference(result.reference);
    setMasked(result.maskedDestination);
    setDemoCode(result.demoCode);
  }

  async function submitCode() {
    if (!reference) return;
    setBusy(true);
    setError(null);
    const result = await verifyPortalCode(audience, reference, code);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === "incomplete"
          ? t.codeIncomplete
          : result.reason === "wrong_code"
            ? t.wrongCode
            : result.reason === "expired"
              ? t.codeExpired
              : result.reason === "too_many_attempts"
                ? t.tooManyAttempts
                : t.error,
      );
      return;
    }
    rememberSession(result.session);
    setSession(result.session);
    setName("");
    setNumber("");
    setCode("");
    setReference(null);
    setDemoCode(null);
  }

  async function out() {
    await clearSession();
    setSession(null);
  }

  const nameLabel = audience === "individual" ? auth.name : auth.nameBusiness;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="flex items-center justify-center bg-[#0D1B2A] px-8 py-16 text-center text-white">
        <div className="max-w-sm">
          <KimaWordmark tone="light" size="lg" />
          <p className="mt-8 text-base text-white/85">{auth.secure}</p>
        </div>
      </section>

      <main id="main" className="flex items-center justify-center bg-[#F4F6F8] px-4 py-12">
        <div className="w-full max-w-md rounded-card border border-border bg-white px-6 py-8 shadow-raised sm:px-8">
          <h1 className="text-center font-display text-2xl font-bold text-fg">{auth.welcome}</h1>

          {session ? (
            <SessionCard
              locale={locale}
              t={t}
              session={session}
              portalHref={portalHref}
              onSignOut={() => void out()}
            />
          ) : reference ? (
            <div className="mt-6 flex flex-col gap-4">
              <p className="text-sm text-fg-muted">
                {masked ? t.codeIntro.replace("{destination}", masked) : t.codeIntroBlind}
              </p>
              {demoCode && (
                <p className="rounded-lg border border-amber/50 bg-amber-soft px-3 py-2 font-mono text-sm text-amber-text">
                  {t.demoCodeLabel}: {demoCode}
                </p>
              )}
              <label htmlFor="portal-code" className="text-sm font-medium text-fg">
                {t.codeLabel}
                <input
                  id="portal-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy) void submitCode();
                  }}
                  className={`${inputClass} font-mono tracking-widest`}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-danger-text">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitCode()}
                className="public-cta min-h-[48px] rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                {busy ? t.submitting : auth.signIn}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void requestCode()}
                className="min-h-[44px] text-sm font-semibold text-teal-text hover:underline"
              >
                {auth.resend}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReference(null);
                  setCode("");
                  setDemoCode(null);
                  setError(null);
                }}
                className="min-h-[44px] text-sm font-medium text-fg-muted hover:text-fg"
              >
                {t.back}
              </button>
            </div>
          ) : (
            <form
              className="mt-6 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void requestCode();
              }}
            >
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.intro}>
                {(["individual", "business"] as const).map((a) => {
                  const active = audience === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setAudience(a);
                        setError(null);
                      }}
                      className={`min-h-[44px] rounded-lg border px-2 text-sm ${
                        active
                          ? "border-teal bg-teal-soft font-semibold text-fg"
                          : "border-border text-fg-muted hover:bg-[#F4F7FB]"
                      }`}
                    >
                      {a === "individual" ? auth.individual : auth.business}
                    </button>
                  );
                })}
              </div>

              <label htmlFor="portal-name" className="text-sm font-medium text-fg">
                {nameLabel}
                <input
                  id="portal-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </label>

              <label htmlFor="portal-number" className="text-sm font-medium text-fg">
                {nameLabel === auth.name ? t.numberIndividual : t.numberBusiness}
                <input
                  id="portal-number"
                  type="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className={`${inputClass} font-mono tracking-wide`}
                />
              </label>
              <p className="text-xs text-fg-subtle">{t.numberHint}</p>

              {error && (
                <p role="alert" className="text-sm text-danger-text">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="public-cta min-h-[48px] rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                {busy ? t.submitting : auth.sendCode}
              </button>

              <p className="text-center text-xs leading-relaxed text-fg-subtle">{auth.otpNote}</p>

              <p className="text-center text-sm text-fg">
                {auth.noAccount}{" "}
                <Link href={`/${locale}/register`} className="font-semibold text-teal-text hover:underline">
                  {auth.create}
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function SessionCard({
  locale,
  t,
  session,
  portalHref,
  onSignOut,
}: {
  locale: "fr" | "en";
  t: Dict["login"];
  session: PortalSession;
  portalHref: string;
  onSignOut: () => void;
}) {
  const centre = session.taxCentre ? centreDef(session.taxCentre) : undefined;
  const reg = session.taxRegime ? regimeDef(session.taxRegime) : undefined;
  const rows = [
    { label: t.detailName, value: session.displayName },
    { label: t.detailNumber, value: formatTaxNumber(session.niu) || t.detailUnknown },
    { label: t.detailCentre, value: centre ? (locale === "fr" ? centre.fr : centre.en) : t.detailUnknown },
    { label: t.detailRegime, value: reg ? (locale === "fr" ? reg.fr : reg.en) : t.detailUnknown },
  ];

  return (
    <div className="mt-6 flex flex-col gap-4 text-left">
      <p className="text-sm text-fg-muted">{session.displayName}</p>
      {audienceMismatch(session) && (
        <p className="rounded-lg border border-amber/50 bg-amber-soft px-3 py-2 text-sm text-amber-text">{t.mismatch}</p>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg bg-[#F4F7FB] px-3 py-2">
            <dt className="text-xs text-fg-subtle">{row.label}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className={`text-sm ${session.profileVerified ? "text-success-text" : "text-amber-text"}`}>
        {session.profileVerified ? t.verified : t.unverified}
      </p>
      <a href={portalHref} className="public-cta inline-flex min-h-[48px] items-center justify-center rounded-lg text-sm font-semibold">
        {t.continueToPortal}
      </a>
      <button type="button" onClick={onSignOut} className="min-h-[44px] text-sm font-semibold text-fg-muted hover:text-fg">
        {t.signOut}
      </button>
    </div>
  );
}
