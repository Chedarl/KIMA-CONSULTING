"use client";

import { useState, type FormEvent } from "react";
import { insertRegistration } from "@/lib/insert-registration";
import type { getPublicCopy } from "@/lib/i18n-public";
import {
  contactLeadIssues,
  OPEN_WORKSPACE_KINDS,
  type OnboardingDraft,
  type OnboardingIssue,
  type WorkspaceKind,
} from "@/lib/public-onboarding";

type Copy = ReturnType<typeof getPublicCopy>;

const KINDS: readonly WorkspaceKind[] = OPEN_WORKSPACE_KINDS;

export function ContactForm({ locale, copy }: { locale: "fr" | "en"; copy: Copy }) {
  const t = copy.home;
  const [kind, setKind] = useState<WorkspaceKind | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<OnboardingIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const draft: OnboardingDraft = {
      kind,
      intake: "online",
      name,
      email,
      phone,
      legalName: "",
      niu: "",
      sector: "",
      city: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      services: [],
      language: locale,
      note,
    };
    const found = contactLeadIssues(draft);
    setIssues(found);
    setFailed(false);
    if (found.length > 0) return;
    setBusy(true);
    const result = await insertRegistration(draft, crypto.randomUUID());
    setBusy(false);
    if (result === "ok") setDone(true);
    else setFailed(true);
  }

  if (done) {
    return (
      <p role="status" className="rounded-card border border-teal/30 bg-teal-soft px-4 py-4 text-sm text-teal-text">
        {t.contactDone}
      </p>
    );
  }

  const err = (key: OnboardingIssue) => issues.includes(key);

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
      <label className="text-sm font-medium text-fg">
        {t.contactName}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          aria-invalid={err("name")}
          className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-fg">
          {t.contactEmail}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={err("email")}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-fg">
          {t.contactPhone}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            aria-invalid={err("phone")}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm"
          />
        </label>
      </div>
      <label className="text-sm font-medium text-fg">
        {t.contactKind}
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as WorkspaceKind | "")}
          aria-invalid={err("kind")}
          className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm"
        >
          <option value="">{t.contactKind}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t.kinds[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-fg">
        {t.contactMessage}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
      </label>
      {issues.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-danger-text">
          {issues.map((issue) => (
            <li key={issue}>{copy.onboard.errors[issue]}</li>
          ))}
        </ul>
      )}
      {failed && (
        <p role="alert" className="text-sm text-danger-text">
          {t.contactFailed}
        </p>
      )}
      <button type="submit" disabled={busy} className="public-cta inline-flex min-h-[44px] w-fit items-center rounded-lg px-5 text-sm font-semibold disabled:opacity-60">
        {busy ? t.contactSending : t.contactSend}
      </button>
    </form>
  );
}
