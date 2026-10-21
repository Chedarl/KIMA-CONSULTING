"use client";

import { useMemo, useState } from "react";
import { audit, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { ORGANIZER, deriveRequests, reviewerFlags } from "@/lib/organizer";

/**
 * Client onboarding — Intuit Link's organizer, remodelled for Cameroon.
 *
 * What is kept: a questionnaire that produces the document request list, so
 * the client sees a list that fits their business.
 *
 * What is changed: the questions ask about Mobile Money, Sage exports and the
 * tax centre, because the centre sets the deadline here (DGE 15 March, CIME
 * 15 April, CDI 15 May). There is no annual "tax season" to organise around —
 * monthly declarations repeat all year.
 *
 * What is refused: deciding the client's obligations. Intuit can infer a
 * return from the forms; we cannot infer a filing duty from a questionnaire,
 * and never from turnover. Those gaps are listed as reviewer work instead.
 */
export type WizardLabels = {
  open: string;
  title: string;
  intro: string;
  step: string;
  of: string;
  back: string;
  next: string;
  submit: string;
  submitting: string;
  cancel: string;
  derived: string;
  derivedHint: string;
  reviewer: string;
  reviewerHint: string;
  required: string;
  created: string;
  failed: string;
  nothingYet: string;
};

const PAGES = [ORGANIZER.slice(0, 4), ORGANIZER.slice(4, 7), ORGANIZER.slice(7)];

export function OnboardingWizard({
  locale,
  labels,
  onCreated,
}: {
  locale: "fr" | "en";
  labels: WizardLabels;
  onCreated?: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const derived = useMemo(() => deriveRequests(answers), [answers]);
  const flags = useMemo(() => reviewerFlags(answers), [answers]);

  const current = PAGES[page];
  const canAdvance = current.every((q) => !q.required || Boolean(answers[q.key]?.trim()));

  const set = (key: string, value: string) => setAnswers((prev) => ({ ...prev, [key]: value }));

  function reset() {
    setOpen(false);
    setPage(0);
    setAnswers({});
    setTouched(false);
  }

  async function submit() {
    setBusy(true);
    try {
      const db = supabase();
      const { data: org } = await db.from("organizations").select("id").limit(1).maybeSingle();
      if (!org?.id) throw new Error("no organization");

      const { data: taxpayer, error: tpErr } = await db
        .from("taxpayers")
        .insert({
          legal_name: answers.legal_name,
          contact_name: answers.contact_name,
          contact_email: answers.contact_email,
          niu: answers.niu || null,
          tax_centre: answers.tax_centre === "unknown" ? null : answers.tax_centre,
          tax_regime: answers.tax_regime === "unknown" ? null : answers.tax_regime,
          accounting_framework:
            answers.accounting_framework === "unknown" ? null : answers.accounting_framework,
          // Never true on creation: a profile is verified by a reviewer against
          // the taxpayer's official records, not by a questionnaire.
          profile_verified: false,
          onboarded_at: new Date().toISOString(),
          organizer: answers,
        })
        .select("id")
        .single();
      if (tpErr || !taxpayer) throw tpErr ?? new Error("insert failed");

      await db
        .from("engagements")
        .insert({ organization_id: org.id, taxpayer_id: taxpayer.id, status: "authorized" });

      await db.from("organizer_answers").insert(
        Object.entries(answers).map(([question_key, answer]) => ({
          taxpayer_id: taxpayer.id,
          question_key,
          answer,
        })),
      );

      // Fourteen days is a working default the accountant can change, not a
      // statutory date. Statutory dates come only from verified rules.
      const due = new Date();
      due.setDate(due.getDate() + 14);
      const dueOn = due.toISOString().slice(0, 10);

      await db.from("document_requests").insert(
        derived.map((d) => ({
          taxpayer_id: taxpayer.id,
          organization_id: org.id,
          label_fr: d.fr,
          label_en: d.en,
          reason_fr: d.reasonFr,
          reason_en: d.reasonEn,
          status: "requested",
          responsible: "taxpayer",
          due_on: dueOn,
        })),
      );

      await db.from("activity_events").insert({
        taxpayer_id: taxpayer.id,
        actor: "firm",
        text_fr: `Dossier ouvert pour ${answers.legal_name}. ${derived.length} pièces demandées.`,
        text_en: `File opened for ${answers.legal_name}. ${derived.length} documents requested.`,
      });

      await audit({
        taxpayerId: taxpayer.id,
        organizationId: org.id,
        actor: "firm",
        action: "taxpayer.onboarded",
        resourceType: "taxpayer",
        resourceId: taxpayer.id,
        after: { answers, derived: derived.map((d) => d.key) },
      });

      toast(`${labels.created} — ${answers.legal_name}`);
      reset();
      onCreated?.();
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-4 text-sm font-semibold text-surface transition-colors hover:bg-navy-strong"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M8 3.2v9.6M3.2 8h9.6" strokeLinecap="round" />
        </svg>
        {labels.open}
      </button>
    );
  }

  return (
    <div className="rise-in rounded-card border border-border bg-surface shadow-raised">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="font-display text-base font-semibold text-fg">{labels.title}</h3>
          <p className="mt-0.5 text-sm text-fg-muted">{labels.intro}</p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-fg-muted hover:bg-surface-sunken"
        >
          {labels.cancel}
        </button>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {labels.step} {page + 1} {labels.of} {PAGES.length}
          </p>

          {current.map((q) => {
            const label = locale === "fr" ? q.fr : q.en;
            const help = locale === "fr" ? q.helpFr : q.helpEn;
            const invalid = touched && q.required && !answers[q.key]?.trim();
            return (
              <div key={q.key} className="flex flex-col gap-1.5">
                <label htmlFor={q.key} className="text-sm font-medium text-fg">
                  {label}
                  {q.required && <span className="ml-1 text-danger-text">*</span>}
                </label>
                {help && <p className="text-xs text-fg-subtle">{help}</p>}

                {q.kind === "choice" ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
                    {q.choices?.map((c) => {
                      const active = answers[q.key] === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => set(q.key, c.value)}
                          aria-pressed={active}
                          className={`min-h-[44px] rounded-lg border px-3 text-sm transition-colors ${
                            active
                              ? "border-navy bg-navy font-semibold text-surface"
                              : "border-border text-fg-muted hover:bg-surface-sunken"
                          }`}
                        >
                          {locale === "fr" ? c.fr : c.en}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    id={q.key}
                    type={q.kind === "email" ? "email" : "text"}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => set(q.key, e.target.value)}
                    aria-invalid={invalid || undefined}
                    className={`min-h-[44px] rounded-lg border bg-surface px-3 text-sm text-fg ${
                      invalid ? "border-danger-text" : "border-border"
                    }`}
                  />
                )}
                {invalid && <p className="text-xs text-danger-text">{labels.required}</p>}
              </div>
            );
          })}

          <div className="mt-2 flex flex-wrap gap-2">
            {page > 0 && (
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                className="min-h-[44px] rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg"
              >
                {labels.back}
              </button>
            )}
            {page < PAGES.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  setTouched(true);
                  if (canAdvance) {
                    setTouched(false);
                    setPage((p) => p + 1);
                  }
                }}
                className="min-h-[44px] rounded-lg bg-navy px-4 text-sm font-semibold text-surface hover:bg-navy-strong"
              >
                {labels.next}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setTouched(true);
                  if (canAdvance) void submit();
                }}
                className="min-h-[44px] rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface disabled:opacity-60"
              >
                {busy ? labels.submitting : labels.submit}
              </button>
            )}
          </div>
        </div>

        {/* The checklist assembles itself as the answers arrive. */}
        <div className="flex flex-col gap-4 rounded-card border border-border bg-surface-sunken p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-text">
              {labels.derived}
            </p>
            <p className="mt-1 text-xs text-fg-subtle">{labels.derivedHint}</p>
            {derived.length === 0 ? (
              <p className="mt-3 text-sm text-fg-muted">{labels.nothingYet}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {derived.map((d) => (
                  <li key={d.key} className="rise-in rounded-lg bg-surface px-3 py-2">
                    <p className="text-sm font-medium text-fg">{locale === "fr" ? d.fr : d.en}</p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {locale === "fr" ? d.reasonFr : d.reasonEn}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-text">
              {labels.reviewer}
            </p>
            <p className="mt-1 text-xs text-fg-subtle">{labels.reviewerHint}</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {flags.map((f) => (
                <li key={f.en} className="flex gap-2 text-xs text-fg-muted">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
                    aria-hidden="true"
                  />
                  {locale === "fr" ? f.fr : f.en}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
