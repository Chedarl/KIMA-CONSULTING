"use client";

import { useCallback, useEffect, useState } from "react";
import { sessionTaxpayerId, supabase } from "@/lib/supabase";

type Invitation = {
  id: string; organization_id: string; taxpayer_id: string;
  direction: "firm_to_taxpayer" | "taxpayer_to_firm";
  initiated_by: string; recipient_user_id: string;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  expires_at: string;
};
type Firm = { id: string; name: string };

export function InvitationsPanel({ locale, side }: {
  locale: "fr" | "en"; side: "taxpayer" | "firm";
}) {
  const fr = locale === "fr";
  const [userId, setUserId] = useState<string | null>(null);
  const [taxpayerId, setTaxpayerId] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firm, setFirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const db = supabase();
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth.user) {
      setUserId(null);
      setInvites([]);
      setError(fr ? "Connexion requise." : "Sign-in required.");
      return;
    }
    setUserId(auth.user.id);
    const tp = side === "taxpayer" ? await sessionTaxpayerId() : null;
    setTaxpayerId(tp);
    if (side === "taxpayer" && !tp) {
      setError(fr ? "Compte client requis." : "A client account is required.");
      return;
    }
    const [rows, directory] = await Promise.all([
      db.from("engagement_invitations")
        .select("id,organization_id,taxpayer_id,direction,initiated_by,recipient_user_id,status,expires_at")
        .order("created_at", { ascending: false }).limit(100),
      side === "taxpayer" ? db.rpc("firm_directory") : Promise.resolve({ data: [] }),
    ]);
    if (rows.error || (side === "taxpayer" && "error" in directory && directory.error)) {
      setError(fr ? "Invitations indisponibles." : "Invitations unavailable.");
      return;
    }
    setInvites((rows.data ?? []) as Invitation[]);
    setFirms((directory.data ?? []) as Firm[]);
    setError("");
  }, [fr, side]);

  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, action: "accepted" | "declined" | "revoked") {
    if (!userId || busy) return;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase().rpc("decide_invitation", {
      p_invitation_id: id, p_action: action,
    });
    if (failure) setError(fr ? "Action refusée ou invitation expirée." : "Action refused or invitation expired.");
    await load();
    setBusy(false);
  }

  async function requestFirm() {
    if (!taxpayerId || !firm || busy) return;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase().rpc("create_invitation", {
      p_direction: "taxpayer_to_firm", p_organization_id: firm,
      p_taxpayer_id: taxpayerId, p_contact_id: null,
    });
    if (failure) setError(fr ? "Demande refusée. Vérifiez votre compte." : "Request refused. Check your account.");
    await load();
    setBusy(false);
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">
        {fr ? "Invitations et mandats" : "Invitations and engagements"}
      </h1>
      {side === "taxpayer" && taxpayerId && (
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-border p-4">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-2 text-sm">
            {fr ? "Demander un cabinet" : "Request an accounting firm"}
            <select className="min-h-[44px] rounded-lg border border-border p-2"
              value={firm} onChange={(e) => setFirm(e.target.value)}>
              <option value="">{fr ? "Choisir un cabinet" : "Select a firm"}</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy || !firm} onClick={() => void requestFirm()}
            className="min-h-[44px] rounded-lg bg-navy px-4 text-sm font-semibold text-white disabled:opacity-50">
            {fr ? "Envoyer la demande" : "Send request"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {invites.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {fr ? "Aucune invitation pour ce compte." : "No invitations for this account."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {invites.filter((i) => side === "firm" || i.taxpayer_id === taxpayerId).map((i) => {
            const incoming = i.recipient_user_id === userId;
            const expired = i.status === "pending" && new Date(i.expires_at).getTime() <= Date.now();
            const pending = i.status === "pending" && !expired;
            const state = expired ? "expired" : i.status;
            const labels: Record<string, string> = fr
              ? { pending:"En attente",accepted:"Acceptée",declined:"Refusée",revoked:"Révoquée",expired:"Expirée" }
              : { pending:"Pending",accepted:"Accepted",declined:"Declined",revoked:"Revoked",expired:"Expired" };
            return <li key={i.id} className="rounded-card border border-border bg-white p-4">
              <p className="text-sm font-semibold">
                {i.direction === "taxpayer_to_firm"
                  ? (fr ? "Demande du client au cabinet" : "Client request to firm")
                  : (fr ? "Invitation du cabinet au client" : "Firm invitation to client")}
              </p>
              <p className="mt-1 text-xs text-fg-muted">{labels[state]} · {new Date(i.expires_at).toLocaleDateString(fr ? "fr-CM" : "en-CM")}</p>
              {pending && <div className="mt-3 flex flex-wrap gap-2">
                {incoming ? <>
                  <button disabled={busy} onClick={() => void decide(i.id,"accepted")} className="min-h-[44px] rounded-lg bg-teal-text px-4 text-sm text-white">
                    {fr ? "Accepter" : "Accept"}
                  </button>
                  <button disabled={busy} onClick={() => void decide(i.id,"declined")} className="min-h-[44px] rounded-lg border border-border px-4 text-sm">
                    {fr ? "Refuser" : "Decline"}
                  </button>
                </> : <button disabled={busy} onClick={() => void decide(i.id,"revoked")} className="min-h-[44px] rounded-lg border border-border px-4 text-sm">
                  {fr ? "Annuler l'invitation" : "Revoke invitation"}
                </button>}
              </div>}
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
