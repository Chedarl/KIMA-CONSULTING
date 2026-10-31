"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ServiceIcon, type ServiceIconName } from "@/components/marketing/icons";
import { KimaWordmark } from "@/components/marketing/wordmark";
import { insertRegistration, insertWorkspaceInvite } from "@/lib/insert-registration";
import { supabase } from "@/lib/supabase";
import type { getPublicCopy } from "@/lib/i18n-public";
import {
  displayName,
  EMPTY_ONBOARDING,
  inviteEmailIssue,
  issuesFor,
  isOpenWorkspaceKind,
  needsLegalName,
  OPEN_WORKSPACE_KINDS,
  SIDEBAR_STEPS,
  type OnboardingDraft,
  type OnboardingIssue,
  type OnboardingService,
  type OnboardingStep,
  type PublicIntake,
  type WorkspaceKind,
} from "@/lib/public-onboarding";

type Copy = ReturnType<typeof getPublicCopy>;
type FirmChoice = { id: string; name: string; verification_status: "unverified" | "verified" };

const KINDS: readonly WorkspaceKind[] = OPEN_WORKSPACE_KINDS;
const KIND_ICON: Record<WorkspaceKind, ServiceIconName> = {
  individual: "person",
  business: "people",
  accounting_firm: "building",
};

const fieldClass =
  "mt-1.5 min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm text-fg";

export function OnboardingFlow({
  locale,
  copy,
  initialKind,
}: {
  locale: "fr" | "en";
  copy: Copy;
  initialKind?: string;
}) {
  const t = copy.onboard;
  const [firms, setFirms] = useState<FirmChoice[]>([]);
  const [firmState, setFirmState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [draft, setDraft] = useState<OnboardingDraft>({
    ...EMPTY_ONBOARDING,
    language: locale,
    kind: isOpenWorkspaceKind(initialKind) ? initialKind : "",
  });
  const [step, setStep] = useState<OnboardingStep>("type");
  const [issues, setIssues] = useState<OnboardingIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [workspaceRef, setWorkspaceRef] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteState, setInviteState] = useState<"idle" | "busy" | "ok" | "failed">("idle");
  const [inviteIssue, setInviteIssue] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [channelHint, setChannelHint] = useState<"whatsapp" | "callback" | "office" | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase().rpc("firm_directory");
        if (error) throw error;
        if (!active) return;
        const choices = ((data ?? []) as Array<Partial<FirmChoice>>).filter(
          (firm): firm is FirmChoice =>
            typeof firm.id === "string" && typeof firm.name === "string" &&
            (firm.verification_status === "unverified" || firm.verification_status === "verified"),
        );
        setFirms(choices);
        setFirmState("ready");
      } catch {
        if (active) setFirmState("unavailable");
      }
    })();
    return () => { active = false; };
  }, []);

  const other: "fr" | "en" = locale === "fr" ? "en" : "fr";
  const name = displayName(draft) || draft.name.trim();

  function patch(partial: Partial<OnboardingDraft>) {
    setDraft((d) => ({ ...d, ...partial }));
    setIssues([]);
  }

  function go(next: OnboardingStep) {
    const found = issuesFor(step, draft);
    const forward = step === "type" || sidebarIndex(next) > sidebarIndex(step);
    if (found.length > 0 && forward) {
      setIssues(found);
      return;
    }
    setIssues([]);
    setSaveFailed(false);
    setStep(next);
  }

  async function finish() {
    const found = issuesFor("verify", draft);
    setIssues(found);
    setSaveFailed(false);
    if (found.length > 0 || !draft.kind) return;
    if (saved && workspaceRef) {
      setStep("ready");
      return;
    }
    setBusy(true);
    const ref = workspaceRef ?? crypto.randomUUID();
    setWorkspaceRef(ref);
    const result = await insertRegistration(draft, ref);
    setBusy(false);
    if (result === "failed") {
      setSaveFailed(true);
      return;
    }
    setSaved(true);
    setStep("ready");
  }

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    if (!workspaceRef) return;
    if (inviteEmailIssue(inviteEmail)) {
      setInviteIssue(true);
      return;
    }
    setInviteIssue(false);
    setInviteState("busy");
    const result = await insertWorkspaceInvite(workspaceRef, inviteEmail);
    setInviteState(result === "ok" ? "ok" : "failed");
  }

  const companyLabel =
    draft.kind === "individual"
      ? t.sidebar.companyIndividual
      : draft.kind === "accounting_firm"
        ? t.sidebar.companyFirm
        : t.sidebar.company;

  const sidebarLabel: Record<OnboardingStep, string> = {
    type: t.sidebar.account,
    account: t.sidebar.account,
    company: companyLabel,
    contacts: t.sidebar.contacts,
    services: t.sidebar.services,
    verify: t.sidebar.verify,
    ready: t.sidebar.ready,
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      {step === "type" ? (
        <>
          <header className="bg-white">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
              <Link href={`/${locale}`} className="inline-flex min-h-[44px] items-center" aria-label="KIMA CONSULTING">
                <KimaWordmark tone="dark" layout="stack" />
              </Link>
              <div className="ml-auto flex items-center gap-2">
                <a
                  href={`/${other}/register`}
                  hrefLang={other}
                  lang={other}
                  aria-label={copy.header.language}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border px-3 text-xs font-semibold uppercase text-fg hover:bg-white"
                >
                  {locale.toUpperCase()}
                </a>
                <Link
                  href={`/${locale}/register`}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-[#0D1B2A] px-4 text-sm font-semibold text-white hover:bg-[#15283d]"
                >
                  {copy.header.getStarted}
                </Link>
              </div>
            </div>
          </header>
          <main id="main" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-fg-muted" aria-label={t.steps[0]}>
              {t.steps.map((label, i) => (
                <li key={label} className="flex items-center gap-3" aria-current={i === 0 ? "step" : undefined}>
                  <span className={i === 0 ? "font-semibold text-fg" : ""}>
                    {i + 1}. {label}
                  </span>
                  {i < t.steps.length - 1 && (
                    <span aria-hidden="true" className="text-fg-subtle">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <div id="choose" className="mx-auto mt-12 max-w-3xl text-center">
              <h1 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.title}</h1>
              <p className="mt-3 text-sm text-fg-muted sm:text-base">{t.subtitle}</p>
            </div>
            <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-3" role="radiogroup" aria-label={t.title}>
              {KINDS.map((kind) => {
                const selected = draft.kind === kind;
                const card = t.cards[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patch({ kind })}
                    className={`rounded-card border bg-white px-5 py-8 text-center transition hover:shadow-raised ${
                      selected ? "border-teal bg-teal-soft shadow-card" : "border-border hover:border-teal/50"
                    }`}
                  >
                    <span className={`mx-auto flex justify-center ${selected ? "text-teal-text" : "text-navy"}`}>
                      <ServiceIcon name={KIND_ICON[kind]} />
                    </span>
                    <span className="mt-3 block font-display text-lg font-semibold text-fg">{card.title}</span>
                    <span className="mt-2 block text-sm leading-relaxed text-fg-muted">{card.body}</span>
                  </button>
                );
              })}
            </div>
            {issues.includes("kind") && (
              <p role="alert" className="mx-auto mt-4 max-w-xl text-center text-sm text-danger-text">
                {t.errors.kind}
              </p>
            )}
            <div className="mt-8 flex justify-center">
              <button type="button" onClick={() => go("account")} className="public-cta inline-flex min-h-[48px] items-center gap-2 rounded-lg px-8 text-sm font-semibold">
                {t.continue}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <ChannelBar
              t={t}
              onPick={(channel) => {
                if (!draft.kind) {
                  setIssues(["kind"]);
                  return;
                }
                const intake: PublicIntake =
                  channel === "whatsapp" ? "whatsapp" : channel === "office" ? "agency" : "online";
                patch({ intake });
                setChannelHint(channel);
                setIssues([]);
                setStep("account");
              }}
            />
          </main>
        </>
      ) : (
        <main id="main" className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
          <div className="overflow-hidden rounded-card border border-border bg-white shadow-card lg:grid lg:grid-cols-[240px_1fr]">
            <aside className="border-b border-border p-5 lg:border-b-0 lg:border-r">
              <Link href={`/${locale}`} className="inline-flex min-h-[44px] items-center" aria-label="KIMA CONSULTING">
                <KimaWordmark tone="dark" layout="stack" />
              </Link>
              <p className="mt-6 inline-flex min-h-[44px] w-full items-center rounded-lg bg-[#0D1B2A] px-4 text-sm font-semibold text-white">
                {sidebarLabel[step]}
              </p>
              <ol className="mt-6 flex gap-3 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label={sidebarLabel[step]}>
                {SIDEBAR_STEPS.map((key, i) => {
                  const index = sidebarIndex(step);
                  const state = i < index ? "done" : i === index ? "current" : "upcoming";
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        disabled={state === "upcoming"}
                        onClick={() => {
                          setIssues([]);
                          setStep(key);
                        }}
                        aria-current={state === "current" ? "step" : undefined}
                        className="flex min-h-[44px] w-full items-center gap-3 text-left text-sm disabled:cursor-default"
                      >
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 rounded-full ${
                            state === "upcoming" ? "bg-border-strong" : state === "done" ? "bg-success" : "bg-teal"
                          }`}
                          aria-hidden="true"
                        />
                        <span className={state === "current" ? "font-semibold text-fg" : "text-fg-muted"}>
                          {i + 1}. {sidebarLabel[key]}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>
            <div className="p-4 sm:p-6">
              {step !== "ready" && (
                <p className="rounded-lg bg-teal px-4 py-3 text-sm font-medium text-white">{t.banner}</p>
              )}
              <section className={step === "ready" ? "py-6" : "mt-4 overflow-hidden rounded-card border border-border"}>
                {step !== "ready" && (
                  <h1 className="bg-[#0D1B2A] px-5 py-3 font-display text-base font-semibold text-white">
                    {sidebarLabel[step]}
                  </h1>
                )}
                <div className={step === "ready" ? "" : "px-5 py-5"}>
                  {step === "account" && (
                    <AccountStep t={t} draft={draft} patch={patch} issues={issues} hint={channelHint} />
                  )}
                  {step === "company" && (
                    <CompanyStep t={t} draft={draft} patch={patch} issues={issues} />
                  )}
                  {step === "contacts" && (
                    <ContactsStep t={t} draft={draft} patch={patch} issues={issues} />
                  )}
                  {step === "services" && (
                    <ServicesStep t={t} draft={draft} patch={patch} issues={issues}
                       firms={firms} firmState={firmState} />
                  )}
                  {step === "verify" && <VerifyStep t={t} draft={draft} firmName={firms.find((firm) => firm.id === draft.firmId)?.name} />}
                  {step === "ready" && (
                    <ReadyStep
                      locale={locale}
                      t={t}
                      draft={draft}
                      name={name}
                      inviteOpen={inviteOpen}
                      setInviteOpen={setInviteOpen}
                      inviteEmail={inviteEmail}
                      setInviteEmail={setInviteEmail}
                      inviteState={inviteState}
                      inviteIssue={inviteIssue}
                      onInvite={(e) => void sendInvite(e)}
                    />
                  )}
                  <IssueList t={t} issues={step === "verify" ? issues.filter((i) => i !== "kind") : issues} />
                  {saveFailed && (
                    <p role="alert" className="mt-3 text-sm text-danger-text">
                      {t.errors.failed}
                    </p>
                  )}
                  {step !== "ready" && (
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIssues([]);
                          setStep(previous(step));
                        }}
                        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-fg-muted hover:text-fg"
                      >
                        {t.back}
                      </button>
                      {step === "verify" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void finish()}
                          className="public-cta inline-flex min-h-[44px] items-center rounded-lg px-6 text-sm font-semibold disabled:opacity-60"
                        >
                          {busy ? t.creating : t.create}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => go(nextStep(step))}
                          className="public-cta inline-flex min-h-[44px] items-center rounded-lg px-6 text-sm font-semibold"
                        >
                          {t.continue}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

function sidebarIndex(step: OnboardingStep): number {
  const i = SIDEBAR_STEPS.indexOf(step);
  return i < 0 ? 0 : i;
}

function previous(step: OnboardingStep): OnboardingStep {
  const i = sidebarIndex(step);
  if (i <= 0) return "type";
  return SIDEBAR_STEPS[i - 1] ?? "type";
}

function nextStep(step: OnboardingStep): OnboardingStep {
  const i = sidebarIndex(step);
  return SIDEBAR_STEPS[Math.min(i + 1, SIDEBAR_STEPS.length - 1)] ?? "verify";
}

function ChannelBar({
  t,
  onPick,
}: {
  t: Copy["onboard"];
  onPick: (channel: "whatsapp" | "callback" | "office") => void;
}) {
  const items: { key: "whatsapp" | "callback" | "office"; icon: ServiceIconName; label: string }[] = [
    { key: "whatsapp", icon: "whatsapp", label: t.channels.whatsapp },
    { key: "callback", icon: "phone", label: t.channels.callback },
    { key: "office", icon: "pin", label: t.channels.office },
  ];
  return (
    <div className="mx-auto mt-10 grid max-w-4xl overflow-hidden rounded-card border border-border bg-white sm:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onPick(item.key)}
          className="inline-flex min-h-[52px] items-center justify-center gap-2 border-b border-border px-3 text-sm font-medium text-fg last:border-b-0 hover:bg-teal-soft sm:border-b-0 sm:border-r sm:last:border-r-0"
        >
          <span className="text-teal-text">
            <ServiceIcon name={item.icon} />
          </span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function IssueList({ t, issues }: { t: Copy["onboard"]; issues: OnboardingIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul role="alert" className="mt-4 list-disc pl-5 text-sm text-danger-text">
      {issues.map((issue) => (
        <li key={issue}>{t.errors[issue]}</li>
      ))}
    </ul>
  );
}

function AccountStep({
  t,
  draft,
  patch,
  issues,
  hint,
}: {
  t: Copy["onboard"];
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  issues: OnboardingIssue[];
  hint: "whatsapp" | "callback" | "office" | null;
}) {
  const note =
    hint === "whatsapp"
      ? t.channelNotes.whatsapp
      : hint === "office"
        ? t.channelNotes.office
        : hint === "callback"
          ? t.channelNotes.callback
          : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t.accountIntro}</p>
      {note && (
        <p className="rounded-lg border border-amber/40 bg-amber-soft px-3 py-2 text-sm text-amber-text">{note}</p>
      )}
      <Field label={t.fields.name} invalid={issues.includes("name")}>
        <input className={fieldClass} autoComplete="name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
      </Field>
      <Field label={t.fields.email} invalid={issues.includes("email")}>
        <input className={fieldClass} type="email" autoComplete="email" value={draft.email} onChange={(e) => patch({ email: e.target.value })} />
      </Field>
      <Field label={t.fields.phone} invalid={issues.includes("phone") || issues.includes("contact")}>
        <input className={fieldClass} type="tel" autoComplete="tel" inputMode="tel" value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} />
      </Field>
    </div>
  );
}

function CompanyStep({
  t,
  draft,
  patch,
  issues,
}: {
  t: Copy["onboard"];
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  issues: OnboardingIssue[];
}) {
  const legalLabel = draft.kind === "accounting_firm" ? t.fields.practiceName : t.fields.legalName;
  return (
    <div className="flex flex-col gap-4">
      {needsLegalName(draft.kind) && (
        <Field label={legalLabel} invalid={issues.includes("legalName")}>
          <input className={fieldClass} value={draft.legalName} onChange={(e) => patch({ legalName: e.target.value })} />
        </Field>
      )}
      <Field label={t.fields.niu} hint={t.niuHint} invalid={issues.includes("niu")}>
        <input
          className={`${fieldClass} font-mono tracking-wide`}
          spellCheck={false}
          autoCapitalize="characters"
          value={draft.niu}
          onChange={(e) => patch({ niu: e.target.value })}
        />
      </Field>
      {draft.kind !== "individual" && (
        <Field label={t.fields.sector}>
          <select className={fieldClass} value={draft.sector} onChange={(e) => patch({ sector: e.target.value })}>
            <option value="">{t.fields.sectorPlaceholder}</option>
            {t.sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={t.fields.city}>
        <input
          className={fieldClass}
          placeholder={t.fields.cityPlaceholder}
          autoComplete="address-level2"
          value={draft.city}
          onChange={(e) => patch({ city: e.target.value })}
        />
      </Field>
    </div>
  );
}

function ContactsStep({
  t,
  draft,
  patch,
  issues,
}: {
  t: Copy["onboard"];
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  issues: OnboardingIssue[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t.contactsIntro}</p>
      <Field label={t.fields.contactName}>
        <input className={fieldClass} value={draft.contactName} onChange={(e) => patch({ contactName: e.target.value })} />
      </Field>
      <Field label={t.fields.contactEmail} invalid={issues.includes("contactEmail")}>
        <input className={fieldClass} type="email" value={draft.contactEmail} onChange={(e) => patch({ contactEmail: e.target.value })} />
      </Field>
      <Field label={t.fields.contactPhone} invalid={issues.includes("contactPhone")}>
        <input className={fieldClass} type="tel" value={draft.contactPhone} onChange={(e) => patch({ contactPhone: e.target.value })} />
      </Field>
    </div>
  );
}

function ServicesStep({
  t,
  draft,
  patch,
  issues,
  firms,
  firmState,
}: {
  t: Copy["onboard"];
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  issues: OnboardingIssue[];
  firms: FirmChoice[];
  firmState: "loading" | "ready" | "unavailable";
}) {
  const icons: ServiceIconName[] = ["tax", "dsf", "accounting", "calendar", "expert"];
  function toggle(key: OnboardingService) {
    const has = draft.services.includes(key);
    patch({
      services: has ? draft.services.filter((s) => s !== key) : [...draft.services, key],
    });
  }
  return (
    <div>
      <p className="text-sm text-fg-muted">{t.servicesIntro}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {t.serviceItems.map((item, i) => {
          const key = item.key as OnboardingService;
          const on = draft.services.includes(key);
          return (
            <li key={key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(key)}
                className={`flex w-full min-h-[44px] items-start gap-3 rounded-card border px-3 py-3 text-left hover:border-teal/50 ${
                  on ? "border-teal bg-teal-soft" : "border-border bg-white"
                }`}
              >
                <span className="text-teal-text">
                  <ServiceIcon name={icons[i] ?? "tax"} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-fg">{item.title}</span>
                  <span className="block text-xs text-fg-muted">{item.body}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <fieldset className="mt-6 border-t border-border pt-5">
        <legend className="text-sm font-semibold text-fg">{t.firmSelect}</legend>
        <p className="mt-1 text-sm text-fg-muted">{t.firmHelp}</p>
        {firmState === "loading" && <p role="status" className="mt-3 text-sm">{t.firmLoading}</p>}
        {firmState === "unavailable" && (
          <p role="alert" className="mt-3 text-sm text-danger-text">{t.firmDirectoryError}</p>
        )}
        {firmState === "ready" && firms.length === 0 && (
          <p className="mt-3 text-sm text-fg-muted">{t.firmNone}</p>
        )}
        <div className="mt-3 grid gap-2">
          <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-teal">
            <input type="radio" name="receiving-firm" value=""
              checked={!draft.firmId} onChange={() => patch({ firmId: "" })}
              className="h-5 w-5 accent-teal" />
            <span className="text-sm font-semibold text-fg">{t.firmLater}</span>
          </label>
          {firms.map((firm) => (
            <label key={firm.id} className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-teal">
              <input type="radio" name="receiving-firm" value={firm.id}
                checked={draft.firmId === firm.id} onChange={() => patch({ firmId: firm.id })}
                className="h-5 w-5 accent-teal" />
              <span className="text-sm text-fg">
                <span className="block font-semibold">{firm.name}</span>
                <span className="block text-xs text-fg-muted">
                  {firm.verification_status === "verified" ? t.firmVerified : t.firmUnverified}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function VerifyStep({ t, draft, firmName }: { t: Copy["onboard"]; draft: OnboardingDraft; firmName?: string }) {
  const kindLabel = draft.kind ? t.cards[draft.kind].title : t.notProvided;
  const services = useServiceLabels(t, draft.services);
  const rows = [
    [t.summary.kind, kindLabel],
    [t.firmSelect, firmName ?? t.notProvided],
    [t.summary.name, draft.name.trim() || t.notProvided],
    [t.summary.contact, [draft.email, draft.phone].filter(Boolean).join(" · ") || t.notProvided],
    [t.summary.legal, draft.legalName.trim() || t.notProvided],
    [t.summary.niu, draft.niu.trim() || t.notProvided],
    [t.summary.sector, draft.sector || t.notProvided],
    [t.summary.city, draft.city.trim() || t.notProvided],
    [t.summary.services, services || t.notProvided],
    [t.summary.channel, t.channelsLabel[draft.intake]],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{t.verifyTitle}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t.verifyHint}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-[#F4F7FB] px-3 py-2">
            <dt className="text-xs text-fg-subtle">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="rounded-lg border border-amber/40 bg-amber-soft px-3 py-2 text-sm text-amber-text">{t.noRegime}</p>
    </div>
  );
}

function useServiceLabels(t: Copy["onboard"], services: OnboardingService[]): string {
  return useMemo(
    () =>
      t.serviceItems
        .filter((item) => services.includes(item.key as OnboardingService))
        .map((item) => item.title)
        .join(", "),
    [t.serviceItems, services],
  );
}

function ReadyStep({
  locale,
  t,
  draft,
  name,
  inviteOpen,
  setInviteOpen,
  inviteEmail,
  setInviteEmail,
  inviteState,
  inviteIssue,
  onInvite,
}: {
  locale: "fr" | "en";
  t: Copy["onboard"];
  draft: OnboardingDraft;
  name: string;
  inviteOpen: boolean;
  setInviteOpen: (v: boolean) => void;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteState: "idle" | "busy" | "ok" | "failed";
  inviteIssue: boolean;
  onInvite: (e: FormEvent) => void;
}) {
  const firm = draft.kind === "accounting_firm";
  const href = firm ? `/${locale}/firm-login` : `/${locale}/login`;
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M5 12.5 10 17.5 19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-fg">{t.readyTitle}</h1>
      <p className="mt-3 text-sm text-fg">{t.readyIsolated.replace("{name}", name || "—")}</p>
      <p className="text-sm text-fg-muted">{t.readySeparate}</p>
      <p className="mt-3 max-w-md text-sm text-fg-muted">{t.readyHonest}</p>
      {firm && <p className="mt-2 max-w-md text-xs text-fg-subtle">{t.firmNote}</p>}
      <Link href={href} className="public-cta mt-6 inline-flex min-h-[48px] items-center rounded-lg px-8 text-sm font-semibold">
        {firm ? t.enterFirm : t.enterPortal}
      </Link>
      {!inviteOpen && inviteState !== "ok" && (
        <button type="button" onClick={() => setInviteOpen(true)} className="mt-4 min-h-[44px] text-sm font-semibold text-teal-text hover:underline">
          {t.invite}
        </button>
      )}
      {inviteOpen && inviteState !== "ok" && (
        <form onSubmit={onInvite} className="mt-5 w-full max-w-sm text-left">
          <label className="text-sm font-medium text-fg">
            {t.inviteEmail}
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              aria-invalid={inviteIssue}
              className={fieldClass}
            />
          </label>
          {inviteIssue && (
            <p role="alert" className="mt-2 text-sm text-danger-text">
              {t.errors.inviteEmail}
            </p>
          )}
          {inviteState === "failed" && (
            <p role="alert" className="mt-2 text-sm text-danger-text">
              {t.inviteFailed}
            </p>
          )}
          <button
            type="submit"
            disabled={inviteState === "busy"}
            className="public-cta mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg text-sm font-semibold disabled:opacity-60"
          >
            {inviteState === "busy" ? t.inviteSending : t.inviteSend}
          </button>
        </form>
      )}
      {inviteState === "ok" && (
        <p role="status" className="mt-4 text-sm text-success-text">
          {t.inviteDone}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  invalid,
  children,
}: {
  label: string;
  hint?: string;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-fg">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-fg-subtle">{hint}</span>}
      {invalid && <span className="sr-only">.</span>}
    </label>
  );
}
