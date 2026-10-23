"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePortalCopy } from "@/components/client-portal/copy";
import { LoadingRows, OfflineNote, PageHeading, PrimaryButton } from "@/components/client-portal/ui";
import type { Contact, ContactLink } from "@/lib/crm";
import { demoIds, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";

type Taxpayer = {
  id: string;
  legal_name: string;
  niu: string | null;
};

/**
 * Profile reads the taxpayer and the linked contact. NIU stays read-only.
 * SMS is not a channel we store, so that switch stays off and explains why.
 * A refused save is shown as a refusal — the firm holds the record.
 */
export function ProfileBoard({ locale }: { locale: "fr" | "en" }) {
  const copy = usePortalCopy();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [taxpayer, setTaxpayer] = useState<Taxpayer | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [link, setLink] = useState<ContactLink | null>(null);
  const [legalName, setLegalName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailOn, setEmailOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const ids = await demoIds();
      if (!ids) {
        setOffline(true);
        setReady(true);
        return;
      }
      const tp = await db.from("taxpayers").select("id, legal_name, niu").eq("id", ids.taxpayerId).maybeSingle();
      if (tp.error) throw tp.error;
      const row = (tp.data as Taxpayer | null) ?? null;
      setTaxpayer(row);
      setLegalName(row?.legal_name ?? "");
      const links = await db
        .from("contact_account_links")
        .select("id, contact_id, taxpayer_id, relationship, portal_access, notifications, is_primary")
        .eq("taxpayer_id", ids.taxpayerId);
      const list = (links.data ?? []) as ContactLink[];
      const primary = list.find((l) => l.is_primary) ?? list[0] ?? null;
      setLink(primary);
      setEmailOn(Boolean(primary?.notifications));
      if (primary) {
        const person = await db.from("contacts").select("id, full_name, email, phone").eq("id", primary.contact_id).maybeSingle();
        const c = (person.data as Contact | null) ?? null;
        setContact(c);
        setFullName(c?.full_name ?? "");
        setPhone(c?.phone ?? "");
        setEmail(c?.email ?? "");
      }
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!taxpayer) return;
    const dirtyName = legalName.trim() !== taxpayer.legal_name;
    const dirtyContact =
      contact &&
      (fullName.trim() !== (contact.full_name ?? "") ||
        phone.trim() !== (contact.phone ?? "") ||
        email.trim() !== (contact.email ?? ""));
    const dirtyNotes = link && emailOn !== Boolean(link.notifications);
    if (!dirtyName && !dirtyContact && !dirtyNotes) {
      toast(copy.nothingToSave);
      return;
    }
    setBusy(true);
    const db = supabase();
    let failed = 0;
    let tried = 0;
    try {
      if (dirtyName) {
        tried += 1;
        const { error } = await db.from("taxpayers").update({ legal_name: legalName.trim() }).eq("id", taxpayer.id);
        if (error) failed += 1;
      }
      if (dirtyContact && contact) {
        tried += 1;
        const { error } = await db
          .from("contacts")
          .update({ full_name: fullName.trim(), phone: phone.trim() || null, email: email.trim() || null })
          .eq("id", contact.id);
        if (error) failed += 1;
      }
      if (dirtyNotes && link) {
        tried += 1;
        const { error } = await db.from("contact_account_links").update({ notifications: emailOn }).eq("id", link.id);
        if (error) failed += 1;
      }
      if (failed === 0) toast(copy.saved);
      else if (failed < tried) toast(copy.savePartial, "error");
      else toast(copy.saveFailed, "error");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1 min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm text-fg";

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={copy.profileTitle} subtitle={copy.heldByFirm} />
      {offline && <OfflineNote>{copy.offline}</OfflineNote>}
      {!ready ? (
        <LoadingRows label={copy.loading} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-card border border-border bg-white p-5 shadow-card">
              <h2 className="font-display text-base font-semibold text-fg">{copy.business}</h2>
              <label className="mt-4 block text-sm font-medium text-fg">
                {copy.legalName}
                <input value={legalName} onChange={(e) => setLegalName(e.target.value)} className={field} />
              </label>
              <label className="mt-3 block text-sm font-medium text-fg">
                {copy.niu}
                <input value={taxpayer?.niu ?? ""} readOnly className={`${field} bg-surface-sunken`} />
              </label>
              <p className="mt-1 text-xs text-fg-muted">{copy.niuLocked}</p>
            </section>

            <section className="rounded-card border border-border bg-white p-5 shadow-card">
              <h2 className="font-display text-base font-semibold text-fg">{copy.contacts}</h2>
              {!contact ? (
                <p className="mt-3 text-sm text-fg-muted">{copy.noContact}</p>
              ) : (
                <>
                  <label className="mt-4 block text-sm font-medium text-fg">
                    {copy.contactName}
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-fg">
                    {copy.phone}
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={field} />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-fg">
                    {copy.email}
                    <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className={field} />
                  </label>
                </>
              )}
            </section>

            <section className="rounded-card border border-border bg-white p-5 shadow-card">
              <h2 className="font-display text-base font-semibold text-fg">{copy.preferences}</h2>
              <p className="mt-3 text-sm font-medium text-fg">{copy.language}</p>
              <div className="mt-2 inline-flex rounded-lg border border-border p-1" role="group" aria-label={copy.language}>
                {(["en", "fr"] as const).map((code) => (
                  <Link
                    key={code}
                    href={`/${code}/app/profile`}
                    hrefLang={code}
                    aria-current={code === locale ? "true" : undefined}
                    className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-3 text-sm font-semibold ${
                      code === locale ? "bg-[#0D1B2A] text-white" : "text-fg-muted hover:bg-surface-sunken"
                    }`}
                  >
                    {code.toUpperCase()}
                  </Link>
                ))}
              </div>
              <Toggle
                label={copy.emailNotifications}
                checked={emailOn}
                disabled={!link}
                onChange={setEmailOn}
              />
              {!link && <p className="mt-1 text-xs text-fg-muted">{copy.noContact}</p>}
              <Toggle label={copy.smsNotifications} checked={false} disabled onChange={() => undefined} />
              <p className="mt-1 text-xs text-fg-muted">{copy.smsUnavailable}</p>
            </section>

            <section className="rounded-card border border-border bg-white p-5 shadow-card">
              <h2 className="font-display text-base font-semibold text-fg">{copy.security}</h2>
              <p className="mt-2 text-sm font-medium text-fg">{copy.otpTitle}</p>
              <p className="mt-1 text-sm text-fg-muted">{copy.otpBody}</p>
              <Link
                href={`/${locale}/login`}
                className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 text-sm font-semibold text-fg hover:bg-surface-sunken"
              >
                {copy.requestCode}
              </Link>
            </section>
          </div>
          <div className="flex justify-end">
            <PrimaryButton disabled={busy || !taxpayer} onClick={() => void save()}>
              {busy ? copy.saving : copy.save}
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="mt-4 flex min-h-[44px] w-full items-center justify-between gap-3 text-left text-sm font-medium text-fg disabled:opacity-60"
    >
      <span>{label}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-teal" : "bg-border"}`} aria-hidden>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${checked ? "left-5" : "left-0.5"}`} />
      </span>
    </button>
  );
}
