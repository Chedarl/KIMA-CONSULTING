"use client";

import { useEffect, useState } from "react";
import { suggestionDraftAfter } from "@/lib/firm-suggestion-reply";
import { supabase } from "@/lib/supabase";

type Firm = { id: string; name: string };
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
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmId, setFirmId] = useState("");
  const [reason, setReason] = useState("");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [error, setError] = useState<"denied" | "offline" | null>(null);
  const [formNote, setFormNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const db = supabase();
      const [{ data, error: failure }, directory] = await Promise.all([
        db.rpc("list_unassigned_registrations"),
        db.rpc("firm_directory"),
      ]);
      if (!active) return;
      if (failure) {
        setRows([]);
        setError(failure.code === "42501" ? "denied" : "offline");
        return;
      }
      setError(null);
      setRows((data ?? []) as Row[]);
      if (directory.error) {
        setDirectoryError(directory.error.code === "42501"
          ? (fr ? "Liste des cabinets refusée." : "Firm list refused.")
          : (fr ? "Liste des cabinets indisponible." : "Firm list unavailable."));
        setFirms([]);
        return;
      }
      setDirectoryError(null);
      setFirms(((directory.data ?? []) as Firm[]).filter((f) => f.id && f.name));
    })();
    return () => { active = false; };
  }, [fr]);

  async function suggest(id: string) {
    if (id !== applicationId) return;
    setBusy(true);
    setFormNote(null);
    const { data, error: failure } = await supabase().rpc("suggest_firm_for_registration", {
      p_registration_id: id, p_firm_id: firmId, p_reason: reason.trim(),
    });
    setBusy(false);
    if (failure || data == null || data === "") {
      const kept = suggestionDraftAfter({ firmId, reason, applicationId }, "refused");
      setFirmId(kept.firmId);
      setReason(kept.reason);
      setApplicationId(kept.applicationId);
      setFormNote(failure?.code === "42501"
        ? (fr ? "Réservé à un administrateur KIMA." : "KIMA administrators only.")
        : failure?.code === "22023"
          ? (fr ? "Vérifiez le cabinet, le motif (12 caractères au moins) et qu'aucune proposition n'est déjà en cours." : "Check the firm, the reason (at least 12 characters), and that no suggestion is already pending.")
          : (fr ? "Proposition refusée. Aucune attribution n'a été faite." : "Suggestion refused. Nothing was assigned."));
      return;
    }
    const cleared = suggestionDraftAfter({ firmId, reason, applicationId }, "recorded");
    setFirmId(cleared.firmId);
    setReason(cleared.reason);
    setApplicationId(cleared.applicationId);
    setFormNote(fr
      ? "Proposition enregistrée pour cette demande seulement. Le cabinet ne la voit pas tant que le demandeur n'a pas accepté."
      : "Suggestion recorded for this application only. The firm cannot see it until the applicant accepts.");
  }

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
      <p className="px-4 py-3 text-sm text-fg-muted">
        {fr
          ? "Une proposition n'attribue pas la demande. Le demandeur doit accepter."
          : "A suggestion does not assign the application. The applicant must accept."}
      </p>
      <div className="flex flex-col gap-2 border-b border-border px-4 pb-3">
        <label className="text-sm text-fg">
          {fr ? "Cabinet proposé (nom public seulement)" : "Suggested firm (public name only)"}
          <select value={firmId} onChange={(e) => setFirmId(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-border px-2">
            <option value="">{fr ? "Choisir" : "Choose"}</option>
            {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-fg">
          {fr ? "Motif (conservé dans l'audit KIMA)" : "Reason (kept in the KIMA audit)"}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border px-2 py-1" />
        </label>
        {directoryError && <p role="alert" className="text-sm text-danger-text">{directoryError}</p>}
        {applicationId && <p className="text-sm text-fg">{fr ? "Cette proposition concerne une seule demande." : "This suggestion is for one application."}</p>}
        {formNote && <p role="status" className="text-sm text-fg">{formNote}</p>}
      </div>
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-fg-muted">
          <tr className="border-b border-border">
            <th className="px-4 py-3 font-medium">{fr ? "Demandeur" : "Applicant"}</th>
            <th className="px-4 py-3 font-medium">{fr ? "Raison sociale" : "Legal name"}</th>
            <th className="px-4 py-3 font-medium">{fr ? "NIU déclaré" : "Declared NIU"}</th>
            <th className="px-4 py-3 font-medium">{fr ? "Reçue" : "Received"}</th>
            <th className="px-4 py-3 font-medium">{fr ? "Proposer" : "Suggest"}</th>
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
              <td className="px-4 py-3">
                <button type="button"
                  disabled={busy || (applicationId === row.id && (!firmId || reason.trim().length < 12))}
                  onClick={() => {
                    if (applicationId !== row.id) { setApplicationId(row.id); setFormNote(null); return; }
                    void suggest(row.id);
                  }}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-3 text-sm font-semibold text-white disabled:opacity-50">
                  {applicationId === row.id ? (fr ? "Proposer" : "Suggest") : (fr ? "Choisir" : "Choose")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
