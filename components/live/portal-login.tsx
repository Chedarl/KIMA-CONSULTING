"use client";

import { useEffect, useState } from "react";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { regime as regimeDef, taxCentre as centreDef } from "@/lib/rules";
import {
  audienceMismatch,
  clearSession,
  formatTaxNumber,
  readSession,
  rememberSession,
  signIn,
  type PortalAudience,
  type PortalSession,
} from "@/lib/portal-auth";

/**
 * Portal sign-in — name plus taxpayer number.
 *
 * Two doors, because the two audiences do not call the same number by the same
 * name: an individual knows it as their NIU, a business owner says "numéro de
 * contribuable". It is one number; the label follows the person.
 *
 * The part that matters most is what happens AFTER a successful sign-in. The
 * owner asked for this so that clients learn their own details, so the landing
 * state is a details card they are told to write down — name on file, taxpayer
 * number grouped in fours, tax centre, regime — with the verification status
 * shown plainly, because an unverified regime is something the client reported
 * to us, not something we have confirmed.
 *
 * The demo notice is not decoration. The taxpayer number is printed on every
 * invoice this client issues; saying so is more honest than implying the field
 * is a secret. See `lib/portal-auth.ts` for the full posture.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>;

export function PortalLogin({
  locale,
  t,
  portalHref,
}: {
  locale: "fr" | "en";
  t: Dict["login"];
  portalHref: string;
}) {
  const [audience, setAudience] = useState<PortalAudience>("individual");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PortalSession | null>(null);

  // Restore an existing tab session, so a refresh does not look like a logout.
  useEffect(() => {
    const existing = readSession();
    if (existing) setSession(existing);
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await signIn(audience, name, number);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === "incomplete"
          ? t.incomplete
          : result.reason === "no_match"
            ? t.noMatch
            : t.error,
      );
      return;
    }
    rememberSession(result.session);
    setSession(result.session);
    setName("");
    setNumber("");
  }

  function out() {
    clearSession();
    setSession(null);
  }

  if (session) {
    const centre = session.taxCentre ? centreDef(session.taxCentre) : undefined;
    const reg = session.taxRegime ? regimeDef(session.taxRegime) : undefined;
    const rows: { label: string; value: string }[] = [
      { label: t.detailName, value: session.displayName },
      { label: t.detailNumber, value: formatTaxNumber(session.niu) || t.detailUnknown },
      {
        label: t.detailCentre,
        value: centre ? (locale === "fr" ? centre.fr : centre.en) : t.detailUnknown,
      },
      {
        label: t.detailRegime,
        value: reg ? (locale === "fr" ? reg.fr : reg.en) : t.detailUnknown,
      },
    ];

    return (
      <div className="rise-in flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-raised sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-text">
              {t.welcome}
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold text-fg">
              {session.displayName}
            </h2>
          </div>
          <button
            type="button"
            onClick={out}
            className="min-h-[44px] rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken"
          >
            {t.signOut}
          </button>
        </div>

        {audienceMismatch(session) && (
          <p className="rounded-lg border border-amber/50 bg-amber-soft px-3 py-2 text-sm text-amber-text">
            {t.mismatch}
          </p>
        )}

        <div className="rounded-card border border-border bg-surface-sunken p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {t.detailsTitle}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">{t.detailsHint}</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="rounded-lg bg-surface px-3 py-2">
                <dt className="text-xs text-fg-subtle">{row.label}</dt>
                <dd className="mt-0.5 break-words font-medium text-fg">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Confirmed fact and client-reported information must look different —
            a UI non-negotiable, and nowhere more than on the regime. */}
        <p className={`text-sm ${session.profileVerified ? "text-teal-text" : "text-amber-text"}`}>
          {session.profileVerified ? t.verified : t.unverified}
        </p>

        <a
          href={portalHref}
          className="inline-flex min-h-[44px] w-fit items-center rounded-lg bg-navy px-4 text-sm font-semibold text-surface hover:bg-navy-strong"
        >
          {t.continueToPortal}
        </a>
      </div>
    );
  }

  const nameLabel = audience === "individual" ? t.nameIndividual : t.nameBusiness;
  const nameHint = audience === "individual" ? t.nameHintIndividual : t.nameHintBusiness;
  const numberLabel = audience === "individual" ? t.numberIndividual : t.numberBusiness;

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-raised sm:p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-fg">{t.title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t.intro}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.intro}>
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
              className={`min-h-[44px] flex-1 rounded-lg border px-3 text-sm transition-colors sm:flex-none ${
                active
                  ? "border-navy bg-navy font-semibold text-surface"
                  : "border-border text-fg-muted hover:bg-surface-sunken"
              }`}
            >
              {a === "individual" ? t.tabIndividual : t.tabBusiness}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="portal-name" className="text-sm font-medium text-fg">
          {nameLabel}
        </label>
        <p className="text-xs text-fg-subtle">{nameHint}</p>
        <input
          id="portal-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="portal-number" className="text-sm font-medium text-fg">
          {numberLabel}
        </label>
        <p className="text-xs text-fg-subtle">{t.numberHint}</p>
        <input
          id="portal-number"
          // Not a masked field. It is printed on the client's own invoices, and
          // masking it would teach them it is a secret when it is not.
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void submit();
          }}
          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 font-mono text-sm tracking-wide text-fg"
        />
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

      <p className="border-t border-border pt-3 text-xs text-fg-subtle">{t.demoNotice}</p>
    </div>
  );
}
