"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePortalCopy } from "@/components/client-portal/copy";
import { LoadingRows, OfflineNote, PageHeading, PrimaryButton } from "@/components/client-portal/ui";
import type { Contact, ContactLink } from "@/lib/crm";
import { clearSession } from "@/lib/portal-auth";
import { sessionTaxpayerId, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";

type Taxpayer = {
  id: string;
  legal_name: string;
  niu: string | null;
};

/**
 * "Profil et paramètres" -- the settings screen for a client.
 *
 * It had a Save button that could never save. The three writes went through
 * `updateById` to `taxpayers`, `contacts` and `contact_account_links`, and
 * none of those tables carried a client update policy: the only non-firm
 * update on `taxpayers` is `to anon`, which an authenticated client is not.
 * Every save matched zero rows and reported "Enregistrement refusé". The
 * screen looked editable and was not.
 *
 * It also loaded the WRONG PERSON. It took the links for the taxpayer and
 * picked `is_primary`, so a director signing in saw -- and would have
 * edited -- the primary contact's email address rather than their own. The
 * contact is now resolved by `auth_user_id`, the same binding RLS uses.
 *
 * What a client may change is deliberately narrow:
 *
 *   email, phone                    theirs, through update_my_contact_details
 *   notices on this file            theirs, through set_my_file_notifications
 *   legal_name, full_name, NIU      the firm's record of what the DGI holds
 *
 * `legal_name` was editable here. It is the name on the taxpayer's file; a
 * client retyping it would put the firm's record out of step with the DGI's
 * without the firm being told. It is now read-only, like the NIU, and the
 * page already says the firm holds these.
 *
 * SMS is not a channel we store, so that switch stays off and explains why.
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
      // The session's own taxpayer — never the oldest row (demoIds). A save
      // below writes to whatever this resolves to.
      const taxpayerId = await sessionTaxpayerId();
      if (!taxpayerId) {
        setOffline(true);
        setReady(true);
        return;
      }
      const ids = { taxpayerId };
      const tp = await db.from("taxpayers").select("id, legal_name, niu").eq("id", ids.taxpayerId).maybeSingle();
      if (tp.error) throw tp.error;
      const row = (tp.data as Taxpayer | null) ?? null;
      setTaxpayer(row);
      setLegalName(row?.legal_name ?? "");
      // The signed-in person, by the binding every policy uses. Picking the
      // taxpayer's is_primary link instead showed a director someone else's
      // email address and offered to edit it.
      const { data: auth } = await db.auth.getUser();
      const mine = auth.user
        ? await db
            .from("contacts")
            .select("id, full_name, email, phone")
            .eq("auth_user_id", auth.user.id)
            .maybeSingle()
        : { data: null };
      const c = (mine.data as Contact | null) ?? null;
      setContact(c);
      setFullName(c?.full_name ?? "");
      setPhone(c?.phone ?? "");
      setEmail(c?.email ?? "");

      if (c) {
        const links = await db
          .from("contact_account_links")
          .select("id, contact_id, taxpayer_id, relationship, portal_access, notifications, is_primary")
          .eq("taxpayer_id", ids.taxpayerId)
          .eq("contact_id", c.id);
        const own = ((links.data ?? []) as ContactLink[])[0] ?? null;
        setLink(own);
        setEmailOn(Boolean(own?.notifications));
      } else {
        setLink(null);
        setEmailOn(false);
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
    const dirtyDetails =
      contact && (phone.trim() !== (contact.phone ?? "") || email.trim() !== (contact.email ?? ""));
    const dirtyNotes = link && emailOn !== Boolean(link.notifications);
    if (!dirtyDetails && !dirtyNotes) {
      toast(copy.nothingToSave);
      return;
    }
    setBusy(true);
    let failed = 0;
    let tried = 0;
    try {
      const db = supabase();
      // Two definer functions, not table updates. `contacts` has no client
      // update policy and must not get one: an update grant covers every
      // column, and full_name is half the sign-in identifier while
      // organization_id is which firm holds the record.
      if (dirtyDetails && contact) {
        tried += 1;
        const { data, error } = await db.rpc("update_my_contact_details", {
          p_email: email.trim(),
          p_phone: phone.trim(),
        });
        const stored = ((data ?? []) as { email: string | null; phone: string | null }[])[0];
        if (error || !stored) failed += 1;
      }
      if (dirtyNotes && link) {
        tried += 1;
        // The function returns the stored value, so a refusal cannot read as
        // success: it comes back as the opposite of what was asked.
        const { data, error } = await db.rpc("set_my_file_notifications", {
          p_taxpayer_id: link.taxpayer_id,
          p_on: emailOn,
        });
        if (error || data !== emailOn) failed += 1;
      }
      if (failed === 0) toast(copy.saved);
      else if (failed < tried) toast(copy.savePartial, "error");
      else toast(copy.saveFailed, "error");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await clearSession();
    window.location.assign(`/${locale}/login`);
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
                <input value={legalName} readOnly className={`${field} bg-surface-sunken`} />
              </label>
              <label className="mt-3 block text-sm font-medium text-fg">
                {copy.niu}
                <input value={taxpayer?.niu ?? ""} readOnly className={`${field} bg-surface-sunken`} />
              </label>
              <p className="mt-1 text-xs text-fg-muted">{copy.niuLocked}</p>
              <p className="mt-2 text-xs text-fg-muted">{copy.nameHeldByFirm}</p>
            </section>

            <section className="rounded-card border border-border bg-white p-5 shadow-card">
              <h2 className="font-display text-base font-semibold text-fg">{copy.contacts}</h2>
              {!contact ? (
                <p className="mt-3 text-sm text-fg-muted">{copy.noContact}</p>
              ) : (
                <>
                  <label className="mt-4 block text-sm font-medium text-fg">
                    {copy.contactName}
                    <input value={fullName} readOnly className={`${field} bg-surface-sunken`} />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-fg">
                    {copy.phone}
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={field} />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-fg">
                    {copy.email}
                    <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className={field} />
                  </label>
                  <p className="mt-1 text-xs text-fg-muted">{copy.emailIsWhereCodeGoes}</p>
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
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/${locale}/login`}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 text-sm font-semibold text-fg hover:bg-surface-sunken"
                >
                  {copy.requestCode}
                </Link>
                {/*
                  Sign-out also lives in the account dropdown (#394). It is
                  repeated here because the settings page is where a person
                  looks for it, and a second affordance costs nothing.
                */}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-danger-text/30 bg-danger-soft px-4 text-sm font-semibold text-danger-text hover:bg-danger-soft/70"
                >
                  {copy.signOut}
                </button>
              </div>
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
