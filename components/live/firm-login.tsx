"use client";

import { useEffect, useState } from "react";
import {
  clearFirmSession,
  readFirmSession,
  requestFirmCode,
  verifyFirmCode,
  type FirmSession,
} from "@/lib/firm-auth";

type Labels = {
  title: string;
  intro: string;
  email: string;
  emailHint: string;
  requestCode: string;
  codeTitle: string;
  codeIntro: string;
  codeLabel: string;
  verifyCode: string;
  back: string;
  submitting: string;
  incomplete: string;
  notConfigured: string;
  error: string;
  wrongCode: string;
  codeExpired: string;
  tooManyAttempts: string;
  demoCodeLabel: string;
  welcome: string;
  signOut: string;
  continueToWorkspace: string;
  role: string;
};

export function FirmLogin({
  locale,
  t,
  workspaceHref,
}: {
  locale: "fr" | "en";
  t: Labels;
  workspaceHref: string;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [masked, setMasked] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<FirmSession | null>(null);

  useEffect(() => {
    const existing = readFirmSession();
    if (existing) setSession(existing);
  }, []);

  async function requestCode() {
    setBusy(true);
    setError(null);
    const result = await requestFirmCode(email, locale);
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
      setError(t.error);
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
    const result = await verifyFirmCode(reference, code);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === "wrong_code"
          ? t.wrongCode
          : result.reason === "expired"
            ? t.codeExpired
            : result.reason === "too_many_attempts"
              ? t.tooManyAttempts
              : t.error,
      );
      return;
    }
    setSession(result.session);
    setCode("");
    setReference(null);
    setDemoCode(null);
  }

  if (session) {
    return (
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-raised sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-text">
              {t.welcome}
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold text-fg">
              {session.personLabel}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              {t.role}: {session.role}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void clearFirmSession().then(() => setSession(null))}
            className="min-h-[44px] rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken"
          >
            {t.signOut}
          </button>
        </div>
        <a
          href={workspaceHref}
          className="inline-flex min-h-[44px] w-fit items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90"
        >
          {t.continueToWorkspace}
        </a>
      </div>
    );
  }

  if (reference) {
    return (
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-raised sm:p-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-fg">{t.codeTitle}</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {t.codeIntro.replace("{destination}", masked ?? email)}
          </p>
        </div>
        {demoCode && (
          <p className="rounded-lg border border-amber/50 bg-amber-soft px-3 py-2 font-mono text-sm text-amber-text">
            {t.demoCodeLabel}: {demoCode}
          </p>
        )}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={t.codeLabel}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void submitCode();
          }}
          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 font-mono text-sm tracking-widest text-fg"
        />
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitCode()}
            className="min-h-[44px] rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-60"
          >
            {busy ? t.submitting : t.verifyCode}
          </button>
          <button
            type="button"
            onClick={() => {
              setReference(null);
              setCode("");
              setDemoCode(null);
            }}
            className="min-h-[44px] rounded-lg border border-border px-4 text-sm font-semibold text-fg"
          >
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-raised sm:p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-fg">{t.title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t.intro}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="firm-email" className="text-sm font-medium text-fg">
          {t.email}
        </label>
        <p className="text-xs text-fg-subtle">{t.emailHint}</p>
        <input
          id="firm-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void requestCode();
          }}
          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
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
        onClick={() => void requestCode()}
        className="min-h-[44px] rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-60"
      >
        {busy ? t.submitting : t.requestCode}
      </button>
    </div>
  );
}
