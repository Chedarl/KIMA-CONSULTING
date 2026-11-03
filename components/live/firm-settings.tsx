"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Labels = {
  title: string; subtitle: string; profile: string; name: string; registration: string;
  verification: string; verified: string; unverified: string; locale: string; localeHint: string;
  contactEmail: string; contactPhone: string; address: string; city: string;
  save: string; saving: string; saved: string; error: string; readOnly: string;
  staffTitle: string; staffHint: string; staffLink: string;
};

type Org = {
  id: string; name: string; registration_number: string | null;
  verification_status: string | null; preferred_locale: string | null;
  contact_email: string | null; contact_phone: string | null;
  address_line: string | null; city: string | null;
};

/**
 * The firm's own record. The table policy returns exactly one row — the
 * caller's organisation — so no id is ever taken from the URL. Saving goes
 * through RLS: a partner writes, staff gets zero rows and we say so instead of
 * pretending it worked.
 */
export function FirmSettings({ t, staffHref }: { t: Labels; staffHref: string }) {
  const [org, setOrg] = useState<Org | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<"saved" | "error" | "readOnly" | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase()
        .from("organizations")
        .select("id,name,registration_number,verification_status,preferred_locale,contact_email,contact_phone,address_line,city")
        .limit(1);
      if (data?.[0]) setOrg(data[0] as Org);
    })();
  }, []);

  function patch(partial: Partial<Org>) {
    setOrg((o) => (o ? { ...o, ...partial } : o));
    setNote(null);
  }

  async function save() {
    if (!org) return;
    setBusy(true);
    const { data } = await supabase()
      .from("organizations")
      .update({
        name: org.name,
        preferred_locale: org.preferred_locale,
        contact_email: org.contact_email,
        contact_phone: org.contact_phone,
        address_line: org.address_line,
        city: org.city,
      })
      .eq("id", org.id)
      .select("id");
    setBusy(false);
    setNote(data && data.length > 0 ? "saved" : "readOnly");
  }

  if (!org) return <div className="h-24 rounded-card border border-border bg-surface" aria-hidden />;

  const field = "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg";
  const label = "text-xs font-semibold uppercase tracking-wide text-fg-muted";

  return (
    <div className="rounded-card border border-border bg-surface px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">{t.profile}</h3>
        <p className="text-xs text-fg-muted">
          {t.verification}: <span className="font-semibold text-fg">
            {org.verification_status === "verified" ? t.verified : t.unverified}
          </span>
          {org.registration_number ? <span className="ml-2">{t.registration}: {org.registration_number}</span> : null}
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="firm-name">{t.name}</label>
          <input id="firm-name" className={field} value={org.name ?? ""} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="firm-locale">{t.locale}</label>
          <select id="firm-locale" className={field} value={org.preferred_locale ?? "fr"} onChange={(e) => patch({ preferred_locale: e.target.value })}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
          <p className="mt-1 text-xs text-fg-muted">{t.localeHint}</p>
        </div>
        <div>
          <label className={label} htmlFor="firm-email">{t.contactEmail}</label>
          <input id="firm-email" type="email" className={field} value={org.contact_email ?? ""} onChange={(e) => patch({ contact_email: e.target.value || null })} />
        </div>
        <div>
          <label className={label} htmlFor="firm-phone">{t.contactPhone}</label>
          <input id="firm-phone" className={field} value={org.contact_phone ?? ""} onChange={(e) => patch({ contact_phone: e.target.value || null })} />
        </div>
        <div>
          <label className={label} htmlFor="firm-address">{t.address}</label>
          <input id="firm-address" className={field} value={org.address_line ?? ""} onChange={(e) => patch({ address_line: e.target.value || null })} />
        </div>
        <div>
          <label className={label} htmlFor="firm-city">{t.city}</label>
          <input id="firm-city" className={field} value={org.city ?? ""} onChange={(e) => patch({ city: e.target.value || null })} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface disabled:opacity-60">
          {busy ? t.saving : t.save}
        </button>
        {note === "saved" ? <span className="text-sm text-success-text">{t.saved}</span> : null}
        {note === "error" ? <span className="text-sm text-danger">{t.error}</span> : null}
        {note === "readOnly" ? <span className="text-sm text-fg-muted">{t.readOnly}</span> : null}
      </div>
    </div>
  );
}
