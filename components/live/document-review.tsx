"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { readFirmSession } from "@/lib/firm-auth";
import { PageHeading } from "@/components/ui";

type C = { [k: string]: string };
type Doc = { id: string; request_id: string | null; taxpayer_id: string; file_name: string; storage_path: string; byte_size: number | null; mime_type: string | null; sha256: string | null; uploaded_by: string | null; arrived_via: string | null; review_status: string | null; visibility: string | null; created_at: string };
type Ver = { id: string; kind: string; value: string; decided_by: string | null; decided_at: string | null; requires_human_decision: boolean };
type Ver2 = { id: string; version_no: number; byte_size: number | null; sha256: string | null; created_at: string };

const KINDS = ["accounting", "charge_deductibility", "vat_recovery"];
const VALUES = ["pass", "fail", "partial", "indeterminate", "not_applicable"];

export function DocumentReview({ docId, locale, t }: { docId: string; locale: "fr" | "en"; t: C }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [versions, setVersions] = useState<Ver2[]>([]);
  const [verdicts, setVerdicts] = useState<Ver[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const db = supabase();
    const { data } = await db.from("documents").select("*").eq("id", docId).maybeSingle();
    if (!data) { setLoaded(true); return; }
    const d = data as Doc;
    setDoc(d);
    const [vs, vd] = await Promise.all([
      db.from("document_versions").select("id, version_no, byte_size, sha256, created_at").eq("document_id", docId).order("version_no", { ascending: false }),
      db.from("document_verdicts").select("id, kind, value, decided_by, decided_at, requires_human_decision").eq("taxpayer_id", d.taxpayer_id),
    ]);
    setVersions((vs.data ?? []) as Ver2[]);
    setVerdicts((vd.data ?? []) as Ver[]);
    const signed = await db.storage.from("kima-demo").createSignedUrl(d.storage_path, 3600);
    if (signed.data?.signedUrl) setUrl(signed.data.signedUrl);
    setLoaded(true);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [docId]);

  async function record(kind: string, value: string) {
    if (!doc) return;
    setBusy(true);
    const session = readFirmSession();
    const { error } = await supabase().from("document_verdicts").insert({
      taxpayer_id: doc.taxpayer_id,
      document_request_id: doc.request_id,
      kind, value,
      requires_human_decision: value === "indeterminate",
      reasons: [],
      decided_by: session?.personLabel ?? null,
      decided_at: new Date().toISOString(),
    });
    setMsg(error ? t.failed : t.saved);
    setBusy(false);
    if (!error) await load();
  }

  if (!loaded) return <p className="text-sm text-fg-muted">{t.loading}</p>;
  if (!doc) return <p className="text-sm text-fg-muted">{t.notFound}</p>;

  const latest = (kind: string) => verdicts.filter((v) => v.kind === kind).sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))[0];
  const isImage = (doc.mime_type ?? "").startsWith("image/");
  const isPdf = (doc.mime_type ?? "").includes("pdf");

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={doc.file_name} lede={(doc.review_status ?? t.pending) + " · " + (doc.arrived_via ?? "—")} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-h-[24rem] rounded-card border border-border bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.preview}</p>
          {url && isPdf ? <iframe src={url} title={doc.file_name} className="h-[32rem] w-full rounded-lg border border-border" />
            : url && isImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed storage file, not a local asset
              <img src={url} alt={doc.file_name} className="max-h-[32rem] w-full rounded-lg object-contain" />
            )
            : <p className="text-sm text-fg-muted">{t.noPreview}</p>}
          {url ? <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-[40px] items-center text-sm font-semibold text-teal-text hover:underline">{t.download}</a> : null}
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-card border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.metadata}</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs text-fg-subtle">{t.size}</dt><dd className="tnum text-fg">{doc.byte_size ?? "—"}</dd></div>
              <div><dt className="text-xs text-fg-subtle">{t.type}</dt><dd className="text-fg">{doc.mime_type ?? "—"}</dd></div>
              <div><dt className="text-xs text-fg-subtle">{t.visibility}</dt><dd className="text-fg">{doc.visibility ?? "—"}</dd></div>
              <div><dt className="text-xs text-fg-subtle">{t.uploaded}</dt><dd className="truncate text-fg">{doc.uploaded_by ?? "—"}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-fg-subtle">SHA-256</dt><dd className="truncate font-mono text-xs text-fg">{doc.sha256 ?? "—"}</dd></div>
            </dl>
          </section>

          <section className="rounded-card border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.verdicts}</h2>
            <p className="mt-1 text-xs text-fg-muted">{t.verdictsHint}</p>
            <ul className="mt-3 flex flex-col gap-3">
              {KINDS.map((k) => {
                const v = latest(k);
                return (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg">{t[k] ?? k}</span>
                    <span className="flex items-center gap-2">
                      <select defaultValue={v?.value ?? ""} onChange={(e) => void record(k, e.target.value)} disabled={busy} className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-sm text-fg">
                        <option value="" disabled>{t.notSet}</option>
                        {VALUES.map((x) => (<option key={x} value={x}>{t["val_" + x] ?? x}</option>))}
                      </select>
                      {v ? <span className="text-xs text-fg-subtle">{v.decided_by ?? ""} {v.decided_at ? v.decided_at.slice(0, 10) : ""}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            {msg ? <p className="mt-2 text-xs text-success-text">{msg}</p> : null}
          </section>

          <section className="rounded-card border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.versions}</h2>
            {versions.length === 0 ? <p className="mt-2 text-sm text-fg-muted">{t.noVersions}</p> : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {versions.map((v) => (<li key={v.id} className="flex justify-between gap-3"><span className="text-fg">v{v.version_no}</span><span className="truncate text-xs text-fg-subtle">{v.created_at.slice(0, 10)}</span></li>))}
              </ul>
            )}
          </section>

          <Link href={`/${locale}/workspace/inbox`} className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken">{t.back}</Link>
        </div>
      </div>
    </div>
  );
}
