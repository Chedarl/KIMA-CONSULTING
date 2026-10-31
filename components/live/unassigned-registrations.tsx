"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  id: string;
  applicant_name: string;
  applicant_email: string | null;
  legal_name: string | null;
  declared_niu: string | null;
  taxpayer_type: string;
  intake_channel: string;
  status: string;
  submitted_at: string;
};

/** Read-only routing queue. The RPC refuses anyone who is not a KIMA administrator. */
export function UnassignedRegistrations({ locale }: { locale: "fr" | "en" }) {
  const fr = locale === "fr";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<"denied" | "offline" | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: failure } = await supabase().rpc("list_unassigned_registrations");
      if (!active) return;
      if (failure) {
        setRows([]);
        setError(/administrator required/i.test(failure.message) ? "denied" : "offline");
        return;
      }
      setError(null);
      setRows((data ?? []) as Row[]);
    })();
    return () => { active = false; };
  }, []);

  if (rows === null) {
    return <p role="status" className="text-sm text-fg-muted">{fr ? "Chargement…" : "Loading…"}</p>;
  }
  if (error === "denied") {
    return (
      <p role="alert" className="text-sm text-danger-text">
        {fr
          ? "Réservé à un administrateur KIMA. Aucun dossier client n'est affiché."
          : "KIMA administrators only. No client file is shown."}
      </p>
    );
  }
  if (error === "offline") {
    return <p role="alert" className="text-sm text-danger-text">{fr ? "Liste indisponible." : "List unavailable."}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">{fr ? "Aucune demande non attribuée." : "No unassigned application."}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="px-4 py-3 text-left text-sm text-fg-muted">
          {fr
            ? "Lecture seule. L'attribution à un cabinet n'est pas encore décidée."
            : "Read only. Assigning a firm is not decided yet."}
        </caption>
        <thead className="text-fg-muted">
          <tr className="border-b border-border">
            <th className="px-4 py-3 font-medium">{fr ? "Demandeur" : "Applicant"}</th>
            <th className="px-4 py-3 font-medium">{fr ? "Raison sociale" : "Legal name"}</th>
            <th className="px-4 py-3 font-medium">{fr ? "NIU déclaré" : "Declared NIU"}</th>
            <th className="px-4 py-3 font-medium">{fr ? "Reçue" : "Received"}</th>
            <th className="px-4 py-3 font-medium">{fr ? "État" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <span className="block font-medium text-fg">{row.applicant_name}</span>
                <span className="block text-xs text-fg-muted">{row.applicant_email ?? "—"}</span>
              </td>
              <td className="px-4 py-3 text-fg">{row.legal_name ?? row.taxpayer_type}</td>
              <td className="tnum px-4 py-3 font-mono text-xs text-fg">{row.declared_niu ?? "—"}</td>
              <td className="tnum px-4 py-3 text-fg-muted">{row.submitted_at.slice(0, 10)}</td>
              <td className="px-4 py-3 text-fg-muted">{row.status} · {row.intake_channel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
