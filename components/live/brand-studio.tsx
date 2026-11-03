"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { hexToRgb, luminance } from "@/lib/theme";

type Copy = { [k: string]: string };

export function BrandStudio({ t }: { t: Copy }) {
  const [accent, setAccent] = useState("#455DA8");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase().from("branding").select("accent, sender_name, sender_email, portal_slug").eq("scope", "firm").maybeSingle();
      if (!alive || !data) return;
      if (data.accent) setAccent(data.accent);
      if (data.sender_name) setSenderName(data.sender_name);
      if (data.sender_email) setSenderEmail(data.sender_email);
      if (data.portal_slug) setSlug(data.portal_slug);
    })();
    return () => { alive = false; };
  }, []);

  const rgb = hexToRgb(accent);
  const contrast = rgb ? ((1 + 0.05) / (luminance(accent) + 0.05)) : null;
  const contrastOk = contrast !== null && contrast >= 4.5;

  async function save() {
    setStatus("saving");
    const { error } = await supabase().rpc("upsert_branding", {
      p_scope: "firm",
      p_subject_id: null,
      p_logo_path: null,
      p_accent: accent,
      p_portal_slug: slug || null,
      p_sender_name: senderName || null,
      p_sender_email: senderEmail || null,
    });
    setStatus(error ? "failed" : "saved");
  }

  const input = "min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-teal/40";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-fg">{t.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t.subtitle}</p>
      </div>

      <section className="rounded-card border border-border bg-surface p-5">
        <label className="text-sm font-semibold text-fg">{t.accentLabel}</label>
        <p className="mt-1 text-xs text-fg-muted">{t.accentHint}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-11 w-16 cursor-pointer rounded-lg border border-border bg-surface p-1" aria-label={t.accentLabel} />
          <input value={accent} onChange={(e) => setAccent(e.target.value)} className="min-h-[44px] w-32 rounded-lg border border-border bg-surface px-3 font-mono text-sm text-fg" />
          <span className={`text-xs ${contrastOk ? "text-success-text" : "text-amber-text"}`}>
            {contrastOk ? t.contrastOk + " ≥ 4.5:1 ✓" : t.contrastWarn}
          </span>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.previewLabel}</p>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" style={{ backgroundColor: accent }} className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold text-white">{t.save}</button>
          <a href="#" style={{ color: accent }} className="text-sm font-semibold">{t.previewLabel}</a>
          <span style={{ backgroundColor: accent }} className="h-2 w-2 rounded-full" aria-hidden />
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <label className="text-sm font-semibold text-fg">{t.senderName}</label>
        <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="KIMA CONSULTING" className={`${input} mt-2`} />
        <label className="mt-4 block text-sm font-semibold text-fg">{t.senderEmail}</label>
        <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} type="email" placeholder="no-reply@kimaconsulting.app" className={`${input} mt-2`} />
        <label className="mt-4 block text-sm font-semibold text-fg">{t.slugLabel}</label>
        <p className="mt-1 text-xs text-fg-muted">{t.slugHint}</p>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="votrecabinet" className={`${input} mt-2`} />
      </section>

      <button type="button" onClick={save} disabled={status === "saving"} className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#18243B] px-5 text-sm font-semibold text-white hover:bg-[#24314d] disabled:opacity-50">
        {t.save}
      </button>
      {status === "saved" && <p role="status" className="text-sm text-success-text">{t.saved}</p>}
      {status === "failed" && <p role="status" className="text-sm text-danger-text">{t.saveFailed}</p>}
    </div>
  );
}
