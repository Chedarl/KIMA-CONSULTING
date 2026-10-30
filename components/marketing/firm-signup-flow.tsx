"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { sendFirmSignupOtp, verifyFirmSignupOtp } from "@/lib/firm-signup-otp";
import { canonicalRegistrationNumber, firmSignupIssues, signupRpcFailure,
  type FirmSignupInput, type FirmSignupFailure, type FirmSignupIssue } from "@/lib/firm-signup-journey";
import { getFirmSignupCopy } from "@/lib/i18n-firm-signup";

type Step = "email" | "code" | "details" | "done";
type Field = keyof FirmSignupInput;
const fieldClass = "mt-1.5 min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm text-fg focus-visible:outline focus-visible:outline-4 focus-visible:outline-teal-text";
const buttonClass = "min-h-[44px] rounded-lg bg-navy px-5 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-teal-text disabled:opacity-60";

/** Demo mode never contacts Auth or the database. Staging requires isolation. */
export function FirmSignupFlow({ locale, mode }: {
  locale: "fr" | "en"; mode: "demo" | "staging";
}) {
  const t = getFirmSignupCopy(locale);
  const [values, setValues] = useState<FirmSignupInput>({
    email: "", firmName: "", registrationNumber: "", ownerName: "",
  });
  const [step, setStep] = useState<Step>("email");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<FirmSignupFailure | FirmSignupIssue | null>(null);
  const [firmId, setFirmId] = useState<string | null>(null);
  const update = (key: Field, value: string) => {
    setValues((prior) => ({ ...prior, [key]: value }));
    setError(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || step === "done") return;
    setBusy(true);
    setError(null);
    try {
      if (step === "email") {
        if (firmSignupIssues({ ...values, firmName: "Firm", ownerName: "Owner",
          registrationNumber: "EX-0001" }).includes("email")) { setError("email"); return; }
        if (mode === "staging") {
          const result = await sendFirmSignupOtp(supabase().auth, values.email);
          if (!result.ok) { setError(result.reason); return; }
          update("email", result.email);
        }
        setStep("code");
        return;
      }
      if (step === "code") {
        if (!/^\d{6}$/.test(otp.trim())) { setError("invalid_code"); return; }
        if (mode === "staging") {
          const result = await verifyFirmSignupOtp(supabase().auth, values.email, otp);
          if (!result.ok) { setError(result.reason); return; }
        }
        setVerified(true);
        setStep("details");
        return;
      }
      if (!verified) { setError("session_missing"); setStep("email"); return; }
      const issues = firmSignupIssues(values);
      if (issues.length) { setError(issues[0]); return; }
      if (mode === "staging") {
        const { data, error: rpcError } = await supabase().rpc("sign_up_firm", {
          p_name: values.firmName.trim(),
          p_registration_number: canonicalRegistrationNumber(values.registrationNumber),
          p_owner_name: values.ownerName.trim(),
        });
        if (rpcError) { setError(signupRpcFailure(rpcError.code)); return; }
        if (typeof data !== "string" || !data) { setError("failed"); return; }
        setFirmId(data);
      }
      setStep("done");
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  }

  function changeEmail() {
    setOtp(""); setVerified(false); setError(null); setStep("email");
  }
  return (
    <main id="main" className="min-h-screen bg-[#F4F7FB] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-xl">
        <nav className="mb-5 flex items-center justify-between text-sm">
          <Link href={`/${locale}`} className="min-h-[44px] content-center font-semibold text-navy">
            KIMA OS
          </Link>
          <Link href={`/${locale === "fr" ? "en" : "fr"}/register?type=accounting_firm`}
            hrefLang={locale === "fr" ? "en" : "fr"}
            className="min-h-[44px] content-center rounded-lg border border-border px-3 font-semibold text-navy">
            {locale === "fr" ? "English" : "Français"}
          </Link>
        </nav>
        <section className="rounded-xl border border-border bg-white p-5 shadow-raised sm:p-8">
          <h1 className="font-display text-2xl font-bold text-fg">{t.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t.intro}</p>
          {mode === "demo" && (
            <p role="status" className="mt-4 rounded-lg border border-border bg-surface-sunken p-3 text-sm text-fg">
              {t.preview}
            </p>
          )}
          {step === "done" ? (
            <div className="mt-6 space-y-4" role="status">
              <h2 className="text-lg font-semibold text-teal-text">
                {mode === "demo" ? t.mockSuccess : t.success}
              </h2>
              <p className="rounded-lg border border-border bg-surface-sunken p-3 text-sm font-semibold text-fg">{t.pending}</p>
              <p className="text-sm text-fg-muted">{t.limitation}</p>
              {firmId && <p className="break-all text-xs text-fg-subtle">ID: {firmId}</p>}
              {mode === "staging" &&
                <Link href={`/${locale}/firm-login`} className="inline-flex min-h-[44px] items-center font-semibold text-navy underline">
                  {t.login}
                </Link>}
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="mt-6 flex flex-col gap-5" noValidate>
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {step === "email" ? "1 / 3" : step === "code" ? "2 / 3" : "3 / 3"}
              </p>
              {step === "email" && (
                <div>
                  <label htmlFor="firm-email" className="text-sm font-semibold text-fg">{t.email}</label>
                  <input id="firm-email" type="email" autoComplete="email" required
                    value={values.email} onChange={(e) => update("email", e.target.value)}
                    aria-invalid={error === "email" || error === "invalid_email"}
                    className={fieldClass} />
                </div>
              )}
              {step === "code" && (
                <>
                  <p className="break-all text-sm font-medium text-fg">{values.email}</p>
                  <div>
                    <label htmlFor="firm-otp" className="text-sm font-semibold text-fg">{t.code}</label>
                    <input id="firm-otp" type="text" inputMode="numeric" autoComplete="one-time-code"
                      maxLength={6} pattern="[0-9]{6}" required value={otp}
                      onChange={(e) => { setOtp(e.target.value); setError(null); }}
                      className={fieldClass} />
                  </div>
                  <button type="button" onClick={changeEmail}
                    className="min-h-[44px] self-start text-sm font-semibold text-navy underline">
                    {t.changeEmail}
                  </button>
                </>
              )}
              {step === "details" && (
                <>
                  <p className="break-all text-sm text-fg-muted">{values.email}</p>
                  {([
                    ["firmName", t.firm],
                    ["registrationNumber", t.registration],
                    ["ownerName", t.owner],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label htmlFor={key} className="text-sm font-semibold text-fg">{label}</label>
                      <input id={key} type="text" required value={values[key]}
                        autoComplete={key === "ownerName" ? "name" : "off"}
                        aria-invalid={error === key}
                        onChange={(e) => update(key, e.target.value)} className={fieldClass} />
                      {key === "registrationNumber" &&
                        <p className="mt-1 text-xs text-fg-muted">{t.registrationHint}</p>}
                    </div>
                  ))}
                  <p className="text-sm text-fg-muted">{t.pending} {t.limitation}</p>
                </>
              )}
              {error && <p role="alert" className="text-sm font-semibold text-danger-text">{t.errors[error]}</p>}
              <button type="submit" disabled={busy} className={buttonClass}>
                {step === "email" ? (busy ? t.sending : t.send) :
                  step === "code" ? (busy ? t.verifying : t.verify) :
                  (busy ? t.creating : t.create)}
              </button>
              {step === "details" &&
                <button type="button" onClick={changeEmail}
                  className="min-h-[44px] text-sm font-semibold text-navy underline">{t.back}</button>}
              <p className="text-xs text-fg-subtle">{t.support}</p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
