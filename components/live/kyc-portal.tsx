"use client";

import { useEffect, useState } from "react";
import { supabase, whenSignedIn } from "@/lib/supabase";

type Labels = {
  title: string; subtitle: string; sectionApps: string; sectionInquiries: string; sectionFirms: string;
  verify: string; verified: string; unverified: string; reason: string;
  verifyDone: string; verifyFailed: string; empty: string;
};

type App = { id: string; applicant_name: string | null; workspace_kind: string | null; created_at: string };
type Inquiry = { id: string; contact_name: string; contact_email: string | null; inquiry_kind: string; note: string | null };
type Firm = { id: string; name: string; verification_status: string | null };

/**
 * The two KIMA queues and the firm-verification act. Every read runs under the
 * caller's own session, so a non-admin sees empty lists by policy; the verify
 * button calls admin_review_firm, which re-checks the bound kima_admin and
 * raises for anyone else, so the button cannot be a shortcut past the RPC.
 */
export function KycPortal({ t }: { t: Labels }) {
  const [apps, setApps] = useState<App[] | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [firms, setFirms] = useState<Firm[] | null>(null);
  const [note, setNote] = useState<Record<string, "done" | "failed">>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      await whenSignedIn();
      if (!alive) return;
      const db = supabase();
      const [a, i, f] = await Promise.all([
        db.rpc("list_unassigned_registrations"),
        db.from("contact_inquiries").select("id,contact_name,contact_email,inquiry_kind,note").order("received_at", { ascending: false }).limit(50),
        db.rpc("firm_directory"),
      ]);
      if (!alive) return;
      setApps((a.data ?? []) as App[]);
      setInquiries((i.data ?? []) as Inquiry[]);
      setFirms((f.data ?? []) as Firm[]);
    })();
    return () => { alive = false; };
  }, []);

  async function verify(firmId: string) {
    const { error } = await supabase().rpc("admin_review_firm", { p_firm_id: firmId, p_action: "verify", p_reason: "Vérification KYC effectuée par KIMA" });
    setNote((n) => ({ ...n, [firmId]: error ? "failed" : "done" }));
    if (!error) {
      const { data } = await supabase().rpc("firm_directory");
      setFirms((data ?? []) as Firm[]);
    }
  }

  const section = (title: string, empty: boolean, content: React.ReactNode) => (
    <section className="rounded-card border border-border bg-surface px-5 py-4">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {empty ? <p className="mt-2 text-sm text-fg-muted">{t.empty}</p> : content}
    </section>
  );

  const list = (rows: { id: string; primary: string; secondary: string | null }[]) => (
    <ul className="mt-2 divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2">
          <span>
            <span className="text-sm font-medium text-fg">{r.primary}</span>
            {r.secondary ? <span className="ml-2 text-xs text-fg-muted">{r.secondary}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );

  if (apps === null || inquiries === null || firms === null) return <div className="h-24" aria-hidden />;

  return (
    <div className="flex flex-col gap-4">
      {section(t.sectionApps, (apps ?? []).length === 0, list((apps ?? []).map((a) => ({ id: a.id, primary: a.applicant_name ?? "—", secondary: a.workspace_kind }))))}
      {section(t.sectionInquiries, (inquiries ?? []).length === 0, list((inquiries ?? []).map((i) => ({ id: i.id, primary: i.contact_name, secondary: (i.inquiry_kind || "") + (i.contact_email ? " · " + i.contact_email : "") }))))}
      {section(
        t.sectionFirms,
        (firms ?? []).length === 0,
        <ul className="mt-2 divide-y divide-border">
          {(firms ?? []).map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="text-sm font-medium text-fg">{f.name}</span>
                <span className={"ml-2 text-xs " + (f.verification_status === "verified" ? "text-success-text" : "text-amber-text")}>
                  {f.verification_status === "verified" ? t.verified : t.unverified}
                </span>
              </span>
              {f.verification_status !== "verified" ? (
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => void verify(f.id)} className="inline-flex min-h-[44px] items-center rounded-lg border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-surface-sunken">
                    {t.verify}
                  </button>
                  {note[f.id] === "done" ? <span className="text-xs text-success-text">{t.verifyDone}</span> : null}
                  {note[f.id] === "failed" ? <span className="text-xs text-danger">{t.verifyFailed}</span> : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
