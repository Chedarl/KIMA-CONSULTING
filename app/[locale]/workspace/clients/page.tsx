import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import { DemoBanner } from "@/components/ui";
import { ClientsWorkspace } from "@/components/live/clients-workspace";

/** Clients, with onboarding. Both the list and the wizard write to Postgres. */
export default function ClientsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = getDictionary(locale);
  const w = getWorkspaceDictionary(locale);
  const o = w.firm.onboard;

  return (
    <div className="flex flex-col gap-5">
      <DemoBanner>{t.home.demoNotice}</DemoBanner>

      <div>
        <h2 className="font-display text-lg font-semibold text-fg">{o.listTitle}</h2>
        <p className="text-sm text-fg-muted">{w.firm.subtitle}</p>
      </div>

      <ClientsWorkspace
        locale={locale}
        labels={{
          open: o.open,
          title: o.title,
          intro: o.intro,
          step: o.step,
          of: o.of,
          back: o.back,
          next: o.next,
          submit: o.submit,
          submitting: o.submitting,
          cancel: o.cancel,
          derived: o.derived,
          derivedHint: o.derivedHint,
          reviewer: o.reviewer,
          reviewerHint: o.reviewerHint,
          required: o.required,
          created: o.created,
          failed: o.failed,
          nothingYet: o.nothingYet,
          listTitle: o.listTitle,
          empty: o.empty,
          unverified: o.unverified,
          openRequests: o.openRequests,
          noCentre: o.noCentre,
          connecting: t.work.connecting,
          offline: t.work.offline,
          emailClient: w.firm.inbox.emailClient,
          emailSent: w.firm.inbox.emailSent,
          emailNone: w.firm.inbox.emailNone,
          emailNoAddress: w.firm.inbox.emailNoAddress,
          emailBlocked: w.firm.inbox.emailBlocked,
        }}
      />
    </div>
  );
}
