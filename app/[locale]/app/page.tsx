import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  Button,
  Card,
  CardHeader,
  DemoBanner,
  DueBadge,
  PendingAction,
  Timeline,
} from "@/components/ui";
import {
  activeServices,
  activityFeed,
  bucketOf,
  clientActions,
  clientTimeline,
  daysUntil,
  demoAdvisor,
  documentRequests,
  formatTime,
  obligations,
  pick,
  readinessCategories,
  readinessPercent,
} from "@/lib/demo-data";
import { requestIsOutstanding } from "@/lib/cases";

/**
 * The client dashboard — a compliance control centre, not an accounting tool.
 *
 * It answers, in order: am I safe, what is due, what do you need from me, and
 * what is Kima doing. Everything below that is reassurance and record-keeping.
 *
 * The compliance status is derived from the data, never asserted: a hardcoded
 * "up to date" would be the most damaging possible lie in this product.
 */
export default function ClientDashboard({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const c = w.client;

  const openRequests = documentRequests.filter(
    (d) => requestIsOutstanding(d.status) && d.responsible === "taxpayer",
  );
  const nextObligation = [...obligations]
    .filter((o) => o.state.kind !== "filed")
    .sort((a, b) => daysUntil(a.dueOn) - daysUntil(b.dueOn))[0];

  const overdue = openRequests.some((d) => bucketOf(d.dueOn) === "overdue");
  const status = overdue
    ? { label: c.statusValue.actionNeeded, cls: "bg-danger-soft text-danger-text" }
    : openRequests.length > 0
      ? { label: c.statusValue.inProgress, cls: "bg-amber-soft text-amber-text" }
      : { label: c.statusValue.underReview, cls: "bg-navy-soft text-navy" };

  const readiness = readinessPercent();

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      {/* Four summary cards: safe? due? needed? paying for? */}
      <div className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-surface p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
            {c.cards.statusTitle}
          </h3>
          <p
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${status.cls}`}
          >
            {status.label}
          </p>
        </div>

        <div className="bg-surface p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
            {c.cards.deadlineTitle}
          </h3>
          {nextObligation ? (
            <>
              <p className="mt-2 text-sm font-semibold text-fg">
                {pick(nextObligation.label, locale)}
              </p>
              <p className="mt-1.5">
                <DueBadge dueOn={nextObligation.dueOn} locale={locale} />
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">—</p>
          )}
        </div>

        <div className="bg-surface p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
            {c.cards.missingTitle}
          </h3>
          <p className="mt-2 font-display text-2xl font-bold text-amber-text">
            {openRequests.length}
          </p>
          <a
            href={`/${locale}/app/documents`}
            className="mt-1 inline-block text-xs font-semibold text-navy underline underline-offset-2"
          >
            {c.cards.viewChecklist}
          </a>
        </div>

        <div className="bg-surface p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
            {c.cards.servicesTitle}
          </h3>
          <ul className="mt-2 flex flex-col gap-0.5">
            {activeServices.map((s) => (
              <li key={s.en} className="text-sm text-fg">
                {pick(s, locale)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          {/* Why your declaration is not ready — answered before it is asked. */}
          <Card>
            <CardHeader title={c.progressTitle} />
            <div className="px-5 py-4">
              <Timeline
                locale={locale}
                steps={clientTimeline.map((s) => ({
                  label: pick(s.step, locale),
                  state: s.state,
                }))}
              />
              <p className="mt-1 text-xs text-fg-subtle">{c.progressWhy}</p>
            </div>
          </Card>

          <Card>
            <CardHeader title={c.actionsTitle} />
            {clientActions.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">{c.actionsEmpty}</p>
            ) : (
              <ul className="divide-y divide-border">
                {clientActions.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <span className="text-sm text-fg">{pick(a.label, locale)}</span>
                    <Button
                      href={`/${locale}/app/documents`}
                      variant={a.kind === "upload" ? "primary" : "secondary"}
                    >
                      {a.kind === "upload"
                        ? c.uploadNow
                        : a.kind === "pay"
                          ? c.payNow
                          : c.reviewNow}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={c.activityTitle} />
            <ol className="divide-y divide-border">
              {activityFeed.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 px-5 py-2.5">
                  <span className="flex-1 text-sm text-fg">{pick(e.text, locale)}</span>
                  <time
                    dateTime={e.at}
                    className="tnum shrink-0 font-mono text-[11px] text-fg-subtle"
                  >
                    {e.at.slice(0, 10)} · {formatTime(e.at, locale)}
                  </time>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {/* Document readiness — the biggest pain, made visible. */}
          <Card>
            <CardHeader title={c.readinessTitle} />
            <div className="px-5 py-4">
              <p className="font-display text-3xl font-bold text-navy">
                {readiness}%
                <span className="sr-only"> {t.work.readinessLabel}</span>
              </p>
              {/* The track needs a border: surface-sunken is ~1.1:1 against the
                  card, so the 100% extent would otherwise be invisible. */}
              <div
                className="mt-2 h-2 overflow-hidden rounded-full border border-border-strong bg-surface-sunken"
                aria-hidden="true"
              >
                <div className="h-full rounded-full bg-teal" style={{ width: `${readiness}%` }} />
              </div>
              <ul className="mt-4 flex flex-col gap-2">
                {readinessCategories.map((cat) => {
                  // Glyph + word, never colour alone: the amber fill is ~2:1
                  // and a 10px dot cannot carry meaning on its own.
                  const state =
                    cat.state === "complete"
                      ? { cls: "text-teal-text", word: t.work.complete }
                      : cat.state === "partial"
                        ? { cls: "text-amber-text", word: t.work.partial }
                        : { cls: "text-danger-text", word: t.work.missing };
                  return (
                    <li key={cat.label.en} className="flex items-center gap-2.5 text-sm">
                      <svg
                        viewBox="0 0 16 16"
                        className={`h-4 w-4 shrink-0 ${state.cls}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        {cat.state === "complete" ? (
                          <>
                            <circle cx="8" cy="8" r="6.4" />
                            <path d="M5.2 8.2 7.2 10.2l3.6-4" strokeLinecap="round" />
                          </>
                        ) : cat.state === "partial" ? (
                          <>
                            <circle cx="8" cy="8" r="6.4" />
                            <path d="M8 1.6a6.4 6.4 0 0 1 0 12.8z" fill="currentColor" stroke="none" />
                          </>
                        ) : (
                          <circle cx="8" cy="8" r="6.4" strokeDasharray="3 2.5" />
                        )}
                      </svg>
                      <span className="flex-1 text-fg-muted">{pick(cat.label, locale)}</span>
                      <span className={`text-xs font-semibold ${state.cls}`}>{state.word}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4">
                <Button href={`/${locale}/app/documents`} variant="secondary">
                  {c.readinessCta}
                </Button>
              </div>
            </div>
          </Card>

          {/* A name and a face: the service is people, not software. */}
          <Card>
            <CardHeader title={c.advisorTitle} />
            <div className="px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy-soft font-semibold text-navy">
                  {demoAdvisor.initials}
                </span>
                <div>
                  <p className="text-sm font-semibold text-fg">{demoAdvisor.name}</p>
                  <p className="text-xs text-fg-muted">{c.advisorRole}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <PendingAction locale={locale}>{c.advisorMessage}</PendingAction>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={c.knowledgeTitle} />
            <ul className="flex flex-col gap-2 px-5 py-4">
              {c.knowledge.map((k) => (
                <li key={k} className="flex gap-2 text-sm text-fg-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                  {k}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
