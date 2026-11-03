"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Labels = {
  title: string; subtitle: string; chooseFile: string; run: string; running: string;
  totals: string; debit: string; credit: string; unmapped: string; invalid: string;
  colLine: string; colAccount: string; colLabel: string; colDebit: string; colCredit: string; colStatus: string;
  mapped: string; unmappedRow: string; noChart: string; failed: string; empty: string; download: string;
};

type Row = {
  line: number; account: string; label: string; debitXaf: number; creditXaf: number;
  mapping: { status: string };
};
type Result = { rows: Row[]; totalDebitXaf: number; totalCreditXaf: number; unmappedCount: number; invalidCount: number; export?: string };

/**
 * DSF dry run. The file never leaves the browser until the user asks for the
 * check, and the check writes nothing: it reports totals, unmapped accounts and
 * unreadable amounts so a preparer can fix the export before anything reaches a
 * declaration.
 */
export function DsfImport({ t }: { t: Labels }) {
  const [csv, setCsv] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    if (!csv) return;
    setBusy(true);
    setFailed(false);
    setResult(null);
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token ?? "";
    const res = await fetch("/api/dsf/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ csv }),
    });
    setBusy(false);
    if (!res.ok) { setFailed(true); return; }
    setResult((await res.json()) as Result);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken">
            {t.chooseFile}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setName(file.name);
                setResult(null);
                setCsv(await file.text());
              }}
            />
          </label>
          <span className="text-sm text-fg-muted">{name}</span>
          <button type="button" onClick={() => void run()} disabled={busy || !csv} className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface disabled:opacity-60">
            {busy ? t.running : t.run}
          </button>
        </div>
        {failed ? <p className="mt-2 text-sm text-danger">{t.failed}</p> : null}
      </div>

      {result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-card border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-fg-muted">{t.debit}</p>
              <p className="mt-1 text-lg font-semibold text-fg">{result.totalDebitXaf.toLocaleString("fr-FR")}</p>
            </div>
            <div className="rounded-card border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-fg-muted">{t.credit}</p>
              <p className="mt-1 text-lg font-semibold text-fg">{result.totalCreditXaf.toLocaleString("fr-FR")}</p>
            </div>
            <div className="rounded-card border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-fg-muted">{t.unmapped}</p>
              <p className="mt-1 text-lg font-semibold text-amber-text">{result.unmappedCount}</p>
            </div>
            <div className="rounded-card border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-fg-muted">{t.invalid}</p>
              <p className="mt-1 text-lg font-semibold text-danger">{result.invalidCount}</p>
            </div>
          </div>

          {result.export ? (
            <div>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([result.export ?? ""], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "kima-working-pack.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-sunken"
              >
                {t.download}
              </button>
            </div>
          ) : null}

          {result.unmappedCount > 0 ? (
            <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text">{t.noChart}</p>
          ) : null}

          {result.rows.length === 0 ? (
            <p className="text-sm text-fg-muted">{t.empty}</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-fg-muted">
                  <tr>
                    <th className="px-4 py-3">{t.colLine}</th>
                    <th className="px-4 py-3">{t.colAccount}</th>
                    <th className="px-4 py-3">{t.colLabel}</th>
                    <th className="px-4 py-3">{t.colDebit}</th>
                    <th className="px-4 py-3">{t.colCredit}</th>
                    <th className="px-4 py-3">{t.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 50).map((r) => (
                    <tr key={r.line} className="border-t border-border">
                      <td className="px-4 py-3 text-fg-muted">{r.line}</td>
                      <td className="px-4 py-3">{r.account}</td>
                      <td className="px-4 py-3">{r.label}</td>
                      <td className="px-4 py-3">{r.debitXaf.toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-3">{r.creditXaf.toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-3">
                        {r.mapping.status === "mapped"
                          ? <span className="text-success-text">{t.mapped}</span>
                          : <span className="text-amber-text">{t.unmappedRow}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
