"use client";

import { useMemo, useState } from "react";
import { draftEngagement } from "@/lib/engagements";
import { audit, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import {
  clientRequests,
  deriveRequests,
  firmRetrievals,
  questionsFor,
  reviewerFlags,
} from "@/lib/organizer";

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
  firmRetrieved: string;
  firmRetrievedHint: string;
  reviewer: string;
  reviewerHint: string;
  required: string;
  created: string;
  alreadyRegistered: string;
  failed: string;
  nothingYet: string;
};

/**
 * Paging by question key, not by index.
 *
 * This was `ORGANIZER.slice(0, 4)` and friends, which silently reshuffled the
 * wizard the moment a question was inserted — and the practitioner session added
 * five. Keys are declarative: a question absent for this taxpayer simply drops
 * out of its page, and a page left empty is skipped.
 */
const PAGE_KEYS: string[][] = [
  ["taxpayer_type", "legal_name", "full_name", "contact_name", "contact_email"],
  ["niu", "tax_centre", "tax_regime", "accounting_framework", "dpr_access"],
  [
    "has_bank",
    "issues_invoices",
    "has_suppliers",
    "has_payroll",
    "uses_sage",
    "employer_name",
    "other_income",
  ],
];

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

  // What the client is actually asked for, and what we fetch ourselves from the
  // DGI's Harmony 2 portals. Keeping them apart on screen is the point: the
  // client should see that two items are being handled, not be asked for them.
  const asked = useMemo(() => clientRequests(derived), [derived]);
  const retrieved = useMemo(() => firmRetrievals(derived), [derived]);

  // Only the questions that apply to this kind of taxpayer. A student is never
  // asked for a registered business name.
  const applicable = useMemo(() => questionsFor(answers), [answers]);
  const pages = useMemo(
    () =>
      PAGE_KEYS.map((keys) =>
        keys
          .map((k) => applicable.find((q) => q.key === k))
          .filter((q): q is NonNullable<typeof q> => Boolean(q)),
      ).filter((p) => p.length > 0),
    [applicable],
  );

  // The family can change mid-wizard if someone goes back and re-answers, which
  // can shrink the page count under the current index.
  const safePage = Math.min(page, Math.max(pages.length - 1, 0));
  const current = pages[safePage] ?? [];
  const canAdvance =
    current.length > 0 &&
    current.every((q) => !q.required || Boolean(answers[q.key]?.trim()));

  const set = (key: string, value: string) => setAnswers((prev) => ({ ...prev, [key]: value }));

  function reset() {
    setOpen(false);
    setPage(0);
    setAnswers({});
    setTouched(false);
  }

  // The name on the file, whichever kind of taxpayer this is.
  const displayName = answers.legal_name || answers.full_name || "";

  async function submit() {
    setBusy(true);
    try {
      const db = supabase();
      // Opening a client file is one call. open_client_file() writes the
      // taxpayer, the authorised engagement that holds it, the organizer
      // answers, the derived document requests, the client-visible note and the
      // audit entry, in one transaction in the caller's own firm (migrations
      // 20261030110000 and 20261030140000, risks R-54 and R-58). Both those
      // headers carry the history: why the insert-with-RETURNING this replaced
      // could not work, and why four trailing writes could leave a client file
      // that existed, was authorised and was empty.
      //
      // SECURITY INVOKER, so this is still the signed-in member's own write
      // under every policy. No organisation lookup either -- the function
      // resolves the firm itself through current_member_org(). The requests and
      // the note are still built here, because deriveRequests() owns those
      // rules and SQL should not own them twice.
      const due = new Date();
      due.setDate(due.getDate() + 14);
      const dueOn = due.toISOString().slice(0, 10);

      const { data: opened, error: openErr } = await db.rpc("open_client_file", {
        p_legal_name: answers.legal_name || answers.full_name,
        p_taxpayer_type: answers.taxpayer_type || null,
        p_contact_name: answers.contact_name,
        p_contact_email: answers.contact_email,
        p_niu: answers.niu || null,
        // Both stay null for an individual: neither question was asked, and a
        // blank is not a classification.
        p_tax_centre: answers.tax_centre === "unknown" ? null : answers.tax_centre || null,
        p_tax_regime: answers.tax_regime === "unknown" ? null : answers.tax_regime || null,
        p_accounting_framework:
          answers.accounting_framework === "unknown" ? null : answers.accounting_framework,
        p_organizer: answers,
        // Fourteen days is a working default the accountant can change, not a
        // statutory date. Statutory dates come only from verified rules.
        p_requests: derived.map((d) => ({
          key: d.key,
          label_fr: d.fr,
          label_en: d.en,
          reason_fr: d.reasonFr,
          reason_en: d.reasonEn,
          // The work still exists and is still tracked -- but a document we
          // retrieve from Harmony 2 ourselves is the firm's responsibility, not
          // the client's. The client is told it is being handled, not asked.
          responsible: d.retrievedBy === "firm" ? "firm" : "taxpayer",
          due_on: dueOn,
        })),
        p_note: `Dossier ouvert pour ${displayName}. ${asked.length} pièces demandées / File opened for ${displayName}. ${asked.length} documents requested.`,
      });
      const result = (opened as Array<{
        outcome: "opened" | "already_registered";
        taxpayer_id: string | null;
      }> | null)?.[0];
      if (openErr || !result) throw openErr ?? new Error("could not open the client file");

      // Somebody already holds this NIU, so nothing was created and nothing is
      // disclosed: no taxpayer id comes back, and this firm reads none of that
      // client's record. What it has is a drafted engagement the client has to
      // accept (migration 20261030120000, risk R-56). Stop here rather than
      // carry on writing answers and requests against a file we cannot see.
      if (result.outcome === "already_registered" || !result.taxpayer_id) {
        toast(labels.alreadyRegistered, "error");
        setBusy(false);
        return;
      }
      // Everything else -- the organizer answers, the document requests, the
      // client-visible note and the audit entry -- was written inside the same
      // transaction as the taxpayer and its engagement. There is nothing left to
      // save, and nothing left that can half-save.
      //
      // The engagement is created and authorised in there too: for a brand-new
      // client, opening the file is the authorisation (owner decision, 30 Oct).
      // draftEngagement() still governs the engagements screen, where drafting
      // and authorising stay two separate acts.

      toast(`${labels.created} — ${displayName}`);
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
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface transition-colors hover:opacity-90"
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
            {labels.step} {safePage + 1} {labels.of} {pages.length}
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
            {safePage > 0 && (
              <button
                type="button"
                onClick={() => setPage(safePage - 1)}
                className="min-h-[44px] rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg"
              >
                {labels.back}
              </button>
            )}
            {safePage < pages.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  setTouched(true);
                  if (canAdvance) {
                    setTouched(false);
                    setPage(safePage + 1);
                  }
                }}
                className="min-h-[44px] rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90"
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
                {asked.map((d) => (
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

          {/* What we fetch from the DGI ourselves. Shown to the client so they
              can see it is being handled, and shown separately so nobody reads
              it as something they have to find. */}
          {retrieved.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-text">
                {labels.firmRetrieved}
              </p>
              <p className="mt-1 text-xs text-fg-subtle">{labels.firmRetrievedHint}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {retrieved.map((d) => (
                  <li
                    key={d.key}
                    className="rise-in rounded-lg border border-teal/40 bg-surface px-3 py-2"
                  >
                    <p className="text-sm font-medium text-fg">{locale === "fr" ? d.fr : d.en}</p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {locale === "fr" ? d.reasonFr : d.reasonEn}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
