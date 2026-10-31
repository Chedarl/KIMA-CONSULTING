"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sessionTaxpayerId, supabase } from "@/lib/supabase";

type Invitation = {
  id: string; organization_id: string; taxpayer_id: string;
  direction: "firm_to_taxpayer" | "taxpayer_to_firm";
  initiated_by: string; recipient_user_id: string;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  expires_at: string;
};
type Firm = { id: string; name: string };
type DraftEngagement = { id: string; taxpayer_id: string };

export function InvitationsPanel({ locale, side }: {
  locale: "fr" | "en"; side: "taxpayer" | "firm";
}) {
  const fr = locale === "fr";
  const [userId, setUserId] = useState<string | null>(null);
  const [taxpayerId, setTaxpayerId] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firm, setFirm] = useState("");
  const [drafts, setDrafts] = useState<DraftEngagement[]>([]);
  const [engagement, setEngagement] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadEpoch = useRef(0);
  const authEpoch = useRef(0);
  const identityRef = useRef<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    // Identity changes clear prior rows synchronously in the auth handler
    // below. A routine reload swaps rows in place so the lists never blank
    // out after an accept, decline or invite.
    const db = supabase();
    const { data: auth, error: authError } = await db.auth.getUser();
    if (epoch !== loadEpoch.current) return;
    if (authError || !auth.user) {
      setUserId(null);
      setTaxpayerId(null);
      setInvites([]);
      setDrafts([]);
      setFirms([]);
      setError(fr ? "Connexion requise." : "Sign-in required.");
      return;
    }
    setUserId(auth.user.id);
    const tp = side === "taxpayer" ? await sessionTaxpayerId() : null;
    if (epoch !== loadEpoch.current) return;
    setTaxpayerId(tp);
    if (side === "taxpayer" && !tp) {
      setError(fr ? "Compte client requis." : "A client account is required.");
      return;
    }
    const [rows, directory, engagements] = await Promise.all([
      db.from("engagement_invitations")
        .select("id,organization_id,taxpayer_id,direction,initiated_by,recipient_user_id,status,expires_at")
        .order("created_at", { ascending: false }).limit(100),
      side === "taxpayer" ? db.rpc("firm_directory") : Promise.resolve({ data: [] }),
      side === "firm" ? db.from("engagements")
        .select("id,taxpayer_id").in("status", ["draft", "invited"])
        .is("revoked_at", null) : Promise.resolve({ data: [] }),
    ]);
    if (epoch !== loadEpoch.current) return;
    if (rows.error || (side === "taxpayer" && "error" in directory && directory.error)) {
      setError(fr ? "Invitations indisponibles." : "Invitations unavailable.");
      return;
    }
    setInvites((rows.data ?? []) as Invitation[]);
    setFirms((directory.data ?? []) as Firm[]);
    setDrafts((engagements.data ?? []) as DraftEngagement[]);
    setError("");
  }, [fr, side]);

  useEffect(() => {
    void supabase().auth.getUser().then(({ data }) => {
      if (identityRef.current === undefined) identityRef.current = data.user?.id ?? null;
    });
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = supabase().auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      // Refreshes must not invalidate uploads, approvals or active selections.
      // SIGNED_IN may also fire for the same user: compare stable user IDs.
      const nextUserId = event === "SIGNED_OUT" ? null : session?.user?.id ?? null;
      if (nextUserId === identityRef.current) return;
      identityRef.current = nextUserId;
      ++authEpoch.current; // Invalidate mutation completions from the old identity.
      ++loadEpoch.current; // Invalidate requests issued under the old identity.
      setUserId(null);
      setTaxpayerId(null);
      setInvites([]);
      setDrafts([]);
      setFirms([]);
      setFirm("");
      setEngagement("");
      setRecipientEmail("");
      setBusy(false);
      setError("");
      if (timer) clearTimeout(timer);
      // Defer getUser: do not await Supabase calls inside the auth callback.
      timer = setTimeout(() => { void load(); }, 0);
    });
    return () => {
      ++authEpoch.current;
      ++loadEpoch.current;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [load]);

  async function decide(id: string, action: "accepted" | "declined" | "revoked") {
    if (!userId || busy) return;
    // A stale button, expired invitation, or another account's invitation
    // must never initiate an RPC. The database remains the authority.
    const invitation = invites.find((item) => item.id === id);
    if (!invitation || invitation.status !== "pending" ||
        (side === "taxpayer" && invitation.taxpayer_id !== taxpayerId) ||
        !Number.isFinite(new Date(invitation.expires_at).getTime()) ||
        new Date(invitation.expires_at).getTime() <= Date.now() ||
        (action === "revoked"
          ? invitation.initiated_by !== userId
          : invitation.recipient_user_id !== userId)) {
      // A stale click must still be answered: say so and refresh the list
      // so the dead row disappears instead of failing silently.
      setError(fr
        ? "Invitation indisponible ou expirée. La liste a été actualisée."
        : "Invitation unavailable or expired. The list has been refreshed.");
      void load();
      return;
    }
    const epoch = authEpoch.current;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase().rpc("decide_invitation", {
      p_invitation_id: id, p_action: action,
    });
    if (epoch !== authEpoch.current) return;
    await load();
    if (epoch !== authEpoch.current) return;
    if (failure) setError(fr ? "Action refusée ou invitation expirée." : "Action refused or invitation expired.");
    setBusy(false);
  }

  async function requestFirm() {
    // A previously selected firm must still be present in the current directory.
    if (side !== "taxpayer" || !userId || !taxpayerId || !firm || busy ||
        !firms.some((candidate) => candidate.id === firm)) return;
    const epoch = authEpoch.current;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase().rpc("create_invitation", {
      p_direction: "taxpayer_to_firm", p_organization_id: firm,
      p_taxpayer_id: taxpayerId, p_contact_id: null,
    });
    if (epoch !== authEpoch.current) return;
    await load();
    if (epoch !== authEpoch.current) return;
    if (failure) setError(fr ? "Demande refusée. Vérifiez votre compte." : "Request refused. Check your account.");
    setBusy(false);
  }

  async function inviteContact() {
    // A stale engagement selection must not initiate an invitation for another firm.
    if (side !== "firm" || !userId || !engagement || !recipientEmail.trim() || busy ||
        !drafts.some((candidate) => candidate.id === engagement)) return;
    const epoch = authEpoch.current;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase().rpc("create_invitation_for_contact", {
      p_engagement_id: engagement, p_email: recipientEmail.trim(),
    });
    if (epoch !== authEpoch.current) return;
    if (!failure) setRecipientEmail("");
    await load();
    if (epoch !== authEpoch.current) return;
    if (failure) setError(fr
      ? "Destinataire indisponible. Vérifiez le compte client et l'adresse."
      : "Recipient unavailable. Check the client account and email.");
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
          <button type="button" disabled={busy || !firm || !firms.some((candidate) => candidate.id === firm)} onClick={() => void requestFirm()}
            className="min-h-[44px] rounded-lg bg-navy px-4 text-sm font-semibold text-white disabled:opacity-50">
            {fr ? "Envoyer la demande" : "Send request"}
          </button>
        </div>
      )}
      {side === "firm" && userId && (
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-border p-4">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-2 text-sm">
            {fr ? "Dossier en attente" : "Pending engagement"}
            <select value={engagement} onChange={(e) => setEngagement(e.target.value)}
              className="min-h-[44px] rounded-lg border border-border p-2">
              <option value="">{fr ? "Choisir le dossier" : "Select engagement"}</option>
              {drafts.map((d) => <option key={d.id} value={d.id}>
                {d.taxpayer_id.slice(0, 8)} · {d.id.slice(0, 8)}
              </option>)}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-2 text-sm">
            {fr ? "E-mail du contact connu" : "Known contact email"}
            <input type="email" value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="min-h-[44px] rounded-lg border border-border p-2" />
          </label>
          <button type="button" disabled={busy || !engagement || !recipientEmail.trim() || !drafts.some((candidate) => candidate.id === engagement)}
            onClick={() => void inviteContact()}
            className="min-h-[44px] rounded-lg bg-navy px-4 text-sm font-semibold text-white disabled:opacity-50">
            {fr ? "Inviter le client" : "Invite client"}
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
                </> : i.initiated_by === userId ? <button disabled={busy} onClick={() => void decide(i.id,"revoked")} className="min-h-[44px] rounded-lg border border-border px-4 text-sm">
                  {fr ? "Annuler l'invitation" : "Revoke invitation"}
                </button> : null}
              </div>}
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
