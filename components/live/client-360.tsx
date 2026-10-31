"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  awaitingClient,
  clientStatus,
  clientStatusLabel,
  obligationLabel,
  stageLabel,
  type CaseRequest,
  type ComplianceCase,
  type Engagement,
} from "@/lib/cases";
import { describe, timeline, type CaseEvent } from "@/lib/events";
import { regime, taxCentre, taxpayerType, type Regime, type TaxCentre, type TaxpayerType } from "@/lib/rules";
import { linkedFiles, unreachable, type Contact, type ContactLink } from "@/lib/crm";

/**
 * One client, from the firm's side — the board's Client 360.
 *
 * Every tab reads a table that already exists. The four axes stay on
 * separate rows. Billing is labelled as Kima's fee, never as the tax.
 * The firm stage and the five client-facing states are both shown, because
 * this is the firm's screen and the client vocabulary is what the portal
 * will say.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>["client360"];

type Tab = "overview" | "documents" | "engagements" | "messages" | "notes" | "billing";

type Taxpayer = {
  id: string;
  legal_name: string;
  contact_name: string | null;
  contact_email: string | null;
  niu: string | null;
  tax_centre: string | null;
  taxpayer_type: string | null;
  tax_regime: string | null;
  accounting_framework: string | null;
  profile_verified: boolean | null;
};

type Doc = {
  id: string;
  file_name: string;
  review_status: string;
  created_at: string;
  request_id: string | null;
};

type Note = CaseEvent;

type Invoice = {
  id: string;
  number: string;
  total_minor: number;
  status: string;
  due_on: string | null;
};

type Msg = {
  id: string;
  body: string;
  sender: string;
  created_at: string;
};

const CASE_COLUMNS =
  "id, taxpayer_id, engagement_id, obligation_code, period_token, due_on, due_needs_confirmation, due_basis, stage, owner, blocker, opened_at, closed_at, filing_status, filing_reference, filing_evidence_ref, filing_attempted_at, filing_verified_at, payment_evidence_status, billing_status, prepared_by, prepared_at, approved_by, approved_at, self_approved";

export function Client360({
  taxpayerId,
  locale,
  t,
  backHref,
}: {
  taxpayerId: string;
  locale: "fr" | "en";
  t: Dict;
  backHref: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [taxpayer, setTaxpayer] = useState<Taxpayer | null | undefined>(undefined);
  const [cases, setCases] = useState<ComplianceCase[]>([]);
  const [requests, setRequests] = useState<CaseRequest[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [links, setLinks] = useState<ContactLink[]>([]);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const tp = await db
        .from("taxpayers")
        .select(
          "id, legal_name, contact_name, contact_email, niu, tax_centre, taxpayer_type, tax_regime, accounting_framework, profile_verified",
        )
        .eq("id", taxpayerId)
        .maybeSingle();
      if (tp.error) throw tp.error;
      if (!tp.data) {
        setTaxpayer(null);
        return;
      }
      setTaxpayer(tp.data as Taxpayer);

      const [cs, rq, eng, dc, msg, ev, inv] = await Promise.all([
        db.from("compliance_cases").select(CASE_COLUMNS).eq("taxpayer_id", taxpayerId),
        db
          .from("document_requests")
          .select("id, case_id, taxpayer_id, label_fr, label_en, status, responsible, due_on, returned_count")
          .eq("taxpayer_id", taxpayerId),
        db.from("engagements").select("*").eq("taxpayer_id", taxpayerId),
        db
          .from("documents")
          .select("id, file_name, review_status, created_at, request_id")
          .eq("taxpayer_id", taxpayerId)
          .order("created_at", { ascending: false })
          .limit(30),
        db
          .from("messages")
          .select("id, body, sender, created_at")
          .eq("taxpayer_id", taxpayerId)
          .order("created_at", { ascending: false })
          .limit(20),
        db
          .from("case_events")
          .select(
            "id, case_id, occurred_at, dimension, kind, actor_role, actor_label, from_value, to_value, subject_ref, reason, visibility",
          )
          .eq("taxpayer_id", taxpayerId)
          .order("occurred_at", { ascending: false })
          .limit(40),
        db
          .from("invoices")
          .select("id, number, total_minor, status, due_on")
          .eq("taxpayer_id", taxpayerId),
      ]);
      if (cs.error) throw cs.error;
      setCases((cs.data ?? []) as ComplianceCase[]);
      setRequests((rq.data ?? []) as CaseRequest[]);
      setEngagements((eng.data ?? []) as Engagement[]);
      setDocs((dc.data ?? []) as Doc[]);
      setMessages((msg.data ?? []) as Msg[]);
      setNotes(
        ((ev.data ?? []) as Note[]).filter((e) => e.kind === "note_added"),
      );
      setInvoices(inv.error ? [] : ((inv.data ?? []) as Invoice[]));

      const linkRes = await db
        .from("contact_account_links")
        .select(
          "id, contact_id, taxpayer_id, relationship, portal_access, notifications, is_primary",
        )
        .eq("taxpayer_id", taxpayerId);
      const fileLinks = (linkRes.data ?? []) as ContactLink[];
      const contactIds = [...new Set(fileLinks.map((l) => l.contact_id))];
      const [people, wider] = await Promise.all([
        contactIds.length
          ? db.from("contacts").select("id, full_name, email, phone").in("id", contactIds)
          : Promise.resolve({ data: [] }),
        contactIds.length
          ? db
              .from("contact_account_links")
              .select(
                "id, contact_id, taxpayer_id, relationship, portal_access, notifications, is_primary",
              )
              .in("contact_id", contactIds)
          : Promise.resolve({ data: [] }),
      ]);
      setContacts((people.data ?? []) as Contact[]);
      setLinks((wider.data ?? fileLinks) as ContactLink[]);
      setOffline(false);
    } catch {
      setOffline(true);
      setTaxpayer(null);
    }
  }, [taxpayerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byCase = useMemo(() => {
    const out: Record<string, CaseRequest[]> = {};
    for (const r of requests) {
      if (!r.case_id) continue;
      (out[r.case_id] ??= []).push(r);
    }
    return out;
  }, [requests]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: t.overview },
    { id: "documents", label: t.documents },
    { id: "engagements", label: t.engagements },
    { id: "messages", label: t.messages },
    { id: "notes", label: t.notes },
    { id: "billing", label: t.billing },
  ];

  if (taxpayer === undefined) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-20 rounded-card" />
        ))}
      </div>
    );
  }

  if (!taxpayer) {
    return (
      <div className="rounded-card border border-border bg-surface p-5">
        <p className="text-sm text-fg-muted">{offline ? t.offline : t.notFound}</p>
        <Link href={backHref} className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-navy">
          {t.back}
        </Link>
      </div>
    );
  }

  const typeDef = taxpayer.taxpayer_type
    ? taxpayerType(taxpayer.taxpayer_type as TaxpayerType)
    : undefined;
  const regimeDef = taxpayer.tax_regime ? regime(taxpayer.tax_regime as Regime) : undefined;
  const centreDef = taxpayer.tax_centre ? taxCentre(taxpayer.tax_centre as TaxCentre) : undefined;
  const axes = [
    {
      label: locale === "fr" ? "Type" : "Type",
      value: typeDef ? (locale === "fr" ? typeDef.fr : typeDef.en) : (taxpayer.taxpayer_type ?? "—"),
    },
    {
      label: locale === "fr" ? "Régime" : "Regime",
      value: regimeDef ? (locale === "fr" ? regimeDef.fr : regimeDef.en) : (taxpayer.tax_regime ?? "—"),
    },
    {
      label: locale === "fr" ? "Centre" : "Centre",
      value: centreDef ? (locale === "fr" ? centreDef.fr : centreDef.en) : (taxpayer.tax_centre ?? "—"),
    },
    {
      label: locale === "fr" ? "Référentiel" : "Framework",
      value: taxpayer.accounting_framework ?? "—",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={backHref} className="text-sm font-semibold text-navy">
            {t.back}
          </Link>
          <h2 className="mt-1 font-display text-2xl font-semibold text-fg">{taxpayer.legal_name}</h2>
          <p className="text-sm text-fg-muted">
            {taxpayer.contact_name ?? ""}
            {taxpayer.contact_email ? ` · ${taxpayer.contact_email}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-xs font-semibold ${
            taxpayer.profile_verified
              ? "border-success/40 bg-success-soft text-success-text"
              : "border-dashed border-amber-text/40 bg-amber-soft text-amber-text"
          }`}
        >
          {taxpayer.profile_verified ? t.verified : t.unverified}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-3 text-sm font-semibold ${
              tab === item.id ? "border-navy bg-navy text-surface" : "border-border bg-surface text-fg-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <section className="rounded-card border border-border bg-surface">
            <h3 className="border-b border-border px-4 py-3 font-display text-base font-semibold">{t.profile}</h3>
            <dl className="grid gap-px bg-border sm:grid-cols-2">
              <div className="bg-surface px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-fg-subtle">NIU</dt>
                <dd className="tnum mt-1 font-mono text-sm">{taxpayer.niu ?? "—"}</dd>
              </div>
              <div className="bg-surface px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-fg-subtle">{t.axes}</dt>
                <dd className="mt-1 text-xs text-fg-subtle">{t.axesHint}</dd>
              </div>
              {axes.map((row) => (
                <div key={row.label} className="bg-surface px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-fg-subtle">{row.label}</dt>
                  <dd className="mt-1 text-sm font-medium text-fg">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-card border border-border bg-surface">
            <h3 className="border-b border-border px-4 py-3 font-display text-base font-semibold">{t.contacts}</h3>
            {unreachable(links, contacts, taxpayer.id) && (
              <p className="border-b border-amber/40 bg-amber-soft px-4 py-3 text-sm text-amber-text">
                {t.unreachable}
              </p>
            )}
            {contacts.length === 0 ? (
              <p className="px-4 py-4 text-sm text-fg-muted">{t.noContacts}</p>
            ) : (
              <ul className="divide-y divide-border">
                {contacts.map((person) => {
                  const others = linkedFiles(person.id, links, taxpayer.id);
                  return (
                    <li key={person.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-fg">{person.full_name}</p>
                      <p className="text-xs text-fg-muted">
                        {[person.email, person.phone].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {others.length > 0 && (
                        <p className="mt-1 text-xs text-fg-subtle">
                          {t.alsoLinked}: {others.length}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-card border border-border bg-surface">
            <h3 className="border-b border-border px-4 py-3 font-display text-base font-semibold">{t.cases}</h3>
            {cases.length === 0 ? (
              <p className="px-4 py-4 text-sm text-fg-muted">{t.noCases}</p>
            ) : (
              <ul className="divide-y divide-border">
                {cases.map((c) => {
                  const seen = clientStatus(c, awaitingClient(byCase[c.id] ?? []));
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-fg">
                          {obligationLabel(c.obligation_code, locale)}
                        </p>
                        <p className="tnum font-mono text-xs text-fg-subtle">{c.period_token}</p>
                        <p className="mt-1 text-xs text-fg-muted">
                          {t.firmStage}: {stageLabel(c.stage, locale)} · {t.clientSees}:{" "}
                          {clientStatusLabel(seen, locale)}
                        </p>
                      </div>
                      <Link
                        href={`/${locale}/workspace/cases/${c.id}`}
                        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text"
                      >
                        {t.openCase}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "documents" && (
        <ul className="flex flex-col gap-2">
          {docs.length === 0 ? (
            <li className="text-sm text-fg-muted">{t.noDocuments}</li>
          ) : (
            docs.map((d) => (
              <li key={d.id} className="rounded-card border border-border bg-surface px-4 py-3">
                <p className="text-sm font-medium text-fg">{d.file_name}</p>
                <p className="text-xs text-fg-subtle">
                  {d.review_status} · {d.created_at.slice(0, 10)}
                </p>
              </li>
            ))
          )}
        </ul>
      )}

      {tab === "engagements" && (
        <ul className="flex flex-col gap-2">
          {engagements.length === 0 ? (
            <li className="text-sm text-fg-muted">{t.noEngagements}</li>
          ) : (
            engagements.map((e) => (
              <li key={e.id} className="rounded-card border border-border bg-surface px-4 py-3">
                <p className="text-sm font-medium text-fg">{e.status}</p>
                <p className="text-xs text-fg-muted">
                  {t.scope}: {e.scope_note ?? e.service_code ?? "—"}
                </p>
                <p className="tnum text-xs text-fg-subtle">
                  {t.fee}: {e.fee_xaf == null ? t.noFee : `${e.fee_xaf} XAF`}
                </p>
              </li>
            ))
          )}
        </ul>
      )}

      {tab === "messages" && (
        <ul className="flex flex-col gap-2">
          {messages.length === 0 ? (
            <li className="text-sm text-fg-muted">{t.noMessages}</li>
          ) : (
            messages.map((m) => (
              <li key={m.id} className="rounded-card border border-border bg-surface px-4 py-3">
                <p className="whitespace-pre-wrap text-sm text-fg">{m.body}</p>
                <p className="mt-1 text-xs text-fg-subtle">
                  {m.sender} · {m.created_at.slice(0, 10)}
                </p>
              </li>
            ))
          )}
        </ul>
      )}

      {tab === "notes" && (
        <ul className="flex flex-col gap-2">
          {notes.length === 0 ? (
            <li className="text-sm text-fg-muted">{t.noNotes}</li>
          ) : (
            timeline(notes, "firm").map((n) => (
              <li key={n.id} className="rounded-card border border-border bg-surface px-4 py-3">
                <p className="text-sm text-fg">{describe(n, locale)}</p>
                <p className="mt-1 text-xs text-fg-subtle">{n.occurred_at.slice(0, 10)}</p>
              </li>
            ))
          )}
        </ul>
      )}

      {tab === "billing" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-fg-subtle">{t.billingHint}</p>
          {invoices.length === 0 ? (
            <p className="text-sm text-fg-muted">{t.noInvoices}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invoices.map((inv) => (
                <li key={inv.id} className="rounded-card border border-border bg-surface px-4 py-3">
                  <p className="text-sm font-medium text-fg">{inv.number}</p>
                  <p className="tnum text-xs text-fg-muted">
                    {inv.total_minor} XAF · {inv.status}
                    {inv.due_on ? ` · ${inv.due_on}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
