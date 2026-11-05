"use client";

import { useEffect, useState } from "react";
import { suggestionReply } from "@/lib/firm-suggestion-reply";
import { supabase } from "@/lib/supabase";

type Suggestion = { firm_name: string; status: string; expires_at: string };

/** The applicant sees the firm name only, and nothing is assigned until they accept. */
export function ApplicantFirmSuggestion({ locale, workspaceRef }: { locale: "fr" | "en"; workspaceRef: string }) {
  const fr = locale === "fr";
  const [row, setRow] = useState<Suggestion | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void supabase().rpc("my_firm_suggestion", { p_workspace_ref: workspaceRef }).then(({ data, error }) => {
      if (!live || error) return;
      const first = Array.isArray(data) ? data[0] as Suggestion | undefined : null;
      if (first?.firm_name && first.status === "pending") setRow(first);
    });
    return () => { live = false; };
  }, [workspaceRef]);

  async function answer(action: "accept" | "decline") {
    setBusy(true);
    const { data, error } = await supabase().rpc("respond_to_firm_suggestion", {
      p_workspace_ref: workspaceRef, p_action: action,
    });
    setBusy(false);
    const reply = suggestionReply(locale, error, data);
    if (!reply.assigned) {
      setNote(reply.message);
      if (!error) setRow(null);
      return;
    }
    setRow(null);
    setNote(reply.message);
  }

  if (!row && !note) return null;

  return (
    <div className="mt-5 w-full max-w-sm rounded-lg border border-border p-4 text-left">
      {row && (
      <p className="text-sm text-fg">
        {fr ? `KIMA vous propose ${row.firm_name}.` : `KIMA suggests ${row.firm_name}.`}
      </p>
      )}
      {row && <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void answer("accept")}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-navy text-sm font-semibold text-white disabled:opacity-50">
          {fr ? "Accepter" : "Accept"}
        </button>
        <button type="button" disabled={busy} onClick={() => void answer("decline")}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-border text-sm font-semibold disabled:opacity-50">
          {fr ? "Refuser" : "Decline"}
        </button>
      </div>}
      {note && <p role="status" className="mt-2 text-sm text-fg">{note}</p>}
    </div>
  );
}
