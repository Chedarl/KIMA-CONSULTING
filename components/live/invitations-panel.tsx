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
type DraftEngagement = { id: string; taxpayer_id: string; organization_id: string };

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
  // A synchronous lock prevents rapid cross-action invitation RPC replay
  // before React commits the busy-state render.
  const mutationInFlight = useRef(false);
  const identityRef = useRef<string | null | undefined>(undefined);

  const load = useCallback(async (options?: { keepError?: boolean }) => {
    const epoch = ++loadEpoch.current;
    // Identity changes clear prior rows synchronously in the auth handler
    // below. A routine reload swaps rows in place so the lists never blank
    // out after an accept, decline or invite.
    const db = supabase();
    const { data: auth, error: authError } = await db.auth.getUser();
    if (epoch !== loadEpoch.current) return;
    if (authError || !auth.user) {
      // An unavailable Auth session invalidates all previously displayed
      // tenant data and choices, not just the invitation rows.
      setUserId(null);
      setTaxpayerId(null);
      setInvites([]);
      setDrafts([]);
      setFirms([]);
      setFirm("");
      setEngagement("");
      setRecipientEmail("");
      setError(fr ? "Connexion requise." : "Sign-in required.");
      return;
    }
    setUserId(auth.user.id);
    const tp = side === "taxpayer" ? await sessionTaxpayerId() : null;
    if (epoch !== loadEpoch.current) return;
    setTaxpayerId(tp);
    if (side === "taxpayer" && !tp) {
      // No RLS-visible taxpayer means the previous account's invitation
      // list and firm selection cannot remain on screen or be reused.
      setInvites([]);
      setDrafts([]);
      setFirms([]);
      setFirm("");
      setEngagement("");
      setRecipientEmail("");
      setError(fr ? "Compte client requis." : "A client account is required.");
      return;
    }
    // A firm operator may belong to several firms. Resolve the complete
    // *current* active membership set before reading either tenant collection;
    // never rely on a cached organization or the broad invitation query.
    let memberOrgIds: string[] = [];
    if (side === "firm") {
      const members = await db.from("firm_members")
        .select("organization_id")
        .eq("auth_user_id", auth.user.id)
        .eq("active", true)
        .is("deactivated_at", null);
      if (epoch !== loadEpoch.current) return;
      memberOrgIds = [...new Set((members.data ?? []).map((member) => member.organization_id))];
      if (members.error || !memberOrgIds.length) {
        setInvites([]);
        setDrafts([]);
        setFirms([]);
        setFirm("");
        setEngagement("");
        setRecipientEmail("");
        setError(fr ? "Invitations indisponibles." : "Invitations unavailable.");
        return;
      }
    }
    const invitationQuery = db.from("engagement_invitations")
      .select("id,organization_id,taxpayer_id,direction,initiated_by,recipient_user_id,status,expires_at");
    const scopedInvitationQuery = side === "firm"
      ? invitationQuery.in("organization_id", memberOrgIds)
      : invitationQuery.eq("taxpayer_id", tp ?? "");
    const [rows, directory, engagements] = await Promise.all([
      scopedInvitationQuery.order("created_at", { ascending: false }).limit(100),
      side === "taxpayer" ? db.rpc("firm_directory") : Promise.resolve({ data: [] }),
      side === "firm" ? db.from("engagements")
        .select("id,taxpayer_id,organization_id").in("organization_id", memberOrgIds)
        .in("status", ["draft", "invited"])
        .is("revoked_at", null) : Promise.resolve({ data: [] }),
    ]);
    if (epoch !== loadEpoch.current) return;
    if (rows.error || (side === "taxpayer" && "error" in directory && directory.error) ||
        (side === "firm" && "error" in engagements && engagements.error)) {
      // A failed tenant-scoped refresh is not an empty or still-authorized
      // snapshot. Hide previously loaded invitations and recipient choices.
      setInvites([]);
      setFirms([]);
      setDrafts([]);
      setFirm("");
      setEngagement("");
      setRecipientEmail("");
      setError(fr ? "Invitations indisponibles." : "Invitations unavailable.");
      return;
    }
    setInvites((rows.data ?? []) as Invitation[]);
    setFirms((directory.data ?? []) as Firm[]);
    setDrafts((engagements.data ?? []) as DraftEngagement[]);
    if (!options?.keepError) setError("");
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
      mutationInFlight.current = false;
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
      mutationInFlight.current = false;
      ++loadEpoch.current;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [load]);

  function beginMutation() {
    if (mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setBusy(true);
    return true;
  }

  function finishMutation(epoch: number) {
    // A completion from a previous account must never unlock the new user's
    // request. Auth identity changes reset the old lock in the listener.
    if (epoch !== authEpoch.current) return;
    mutationInFlight.current = false;
    setBusy(false);
  }

  async function decide(id: string, action: "accepted" | "declined" | "revoked") {
    if (!userId || busy) return;
    // The displayed row is only an initial eligibility check; it may have
    // been superseded or revoked since the last inbox refresh.
    const invitation = invites.find((item) => item.id === id);
    if (!invitation || invitation.status !== "pending" ||
        (side === "taxpayer" && invitation.taxpayer_id !== taxpayerId) ||
        !Number.isFinite(new Date(invitation.expires_at).getTime()) ||
        new Date(invitation.expires_at).getTime() <= Date.now() ||
        (action === "revoked"
          ? invitation.initiated_by !== userId
          : invitation.recipient_user_id !== userId)) {
      setError(fr
        ? "Invitation indisponible ou expirée."
        : "Invitation unavailable or expired.");
      void load({ keepError: true });
      return;
    }

    const epoch = authEpoch.current;
    if (!beginMutation()) return;
    setError("");
    try {
      const db = supabase();
      // A session switch can precede the Auth event callback. Do not use the
      // cached userId as authority to submit a decision under a different user.
      const { data: liveAuth, error: liveAuthError } = await db.auth.getUser();
      if (epoch !== authEpoch.current) return;
      if (liveAuthError || !liveAuth.user || liveAuth.user.id !== userId) {
        setError(fr ? "Invitation indisponible ou expirée." : "Invitation unavailable or expired.");
        await load({ keepError: true });
        if (epoch !== authEpoch.current) return;
        return;
      }

      // RLS still restricts reads; the RPC is the final transactional authority.
      // A stale or replaced invitation must not reach that RPC from the UI.
      const { data: liveInvite, error: liveReadError } = await db
        .from("engagement_invitations")
        .select("id,organization_id,taxpayer_id,direction,initiated_by,recipient_user_id,status,expires_at")
        .eq("id", id).maybeSingle();
      if (epoch !== authEpoch.current) return;
      const liveExpiry = liveInvite ? new Date(liveInvite.expires_at).getTime() : NaN;
      if (liveReadError || !liveInvite ||
          liveInvite.organization_id !== invitation.organization_id ||
          liveInvite.taxpayer_id !== invitation.taxpayer_id ||
          liveInvite.direction !== invitation.direction ||
          liveInvite.initiated_by !== invitation.initiated_by ||
          liveInvite.recipient_user_id !== invitation.recipient_user_id ||
          liveInvite.status !== "pending" ||
          !Number.isFinite(liveExpiry) || liveExpiry <= Date.now() ||
          (side === "taxpayer" && liveInvite.taxpayer_id !== taxpayerId) ||
          (action === "revoked"
            ? liveInvite.initiated_by !== userId
            : liveInvite.recipient_user_id !== userId)) {
        setError(fr ? "Invitation indisponible ou expirée." : "Invitation unavailable or expired.");
        await load({ keepError: true });
        if (epoch !== authEpoch.current) return;
        return;
      }

      // A pending invitation may outlive the firm's authorization to act on
      // it. Recheck active membership for this invitation's organization
      // immediately before the decision RPC; the RPC remains the transactional
      // authority if membership changes again between this read and the write.
      if (side === "firm") {
        const { data: activeMembers, error: activeMemberError } = await db
          .from("firm_members")
          .select("id")
          .eq("organization_id", liveInvite.organization_id)
          .eq("auth_user_id", liveAuth.user.id)
          .eq("active", true)
          .is("deactivated_at", null)
          .limit(1);
        if (epoch !== authEpoch.current) return;
        if (activeMemberError || !activeMembers?.length) {
          setInvites([]);
          setDrafts([]);
          setEngagement("");
          setRecipientEmail("");
          setError(fr ? "Invitation indisponible ou expirée." : "Invitation unavailable or expired.");
          await load({ keepError: true });
          if (epoch !== authEpoch.current) return;
          return;
        }
      }

      // A user can change the selected taxpayer without changing Auth identity.
      // Re-resolve the currently RLS-visible taxpayer immediately before the
      // decision RPC rather than trusting the previously rendered invitation.
      if (side === "taxpayer") {
        const liveTaxpayerId = await sessionTaxpayerId();
        if (epoch !== authEpoch.current) return;
        if (!liveTaxpayerId ||
            liveTaxpayerId !== taxpayerId ||
            liveTaxpayerId !== liveInvite.taxpayer_id) {
          setTaxpayerId(null);
          setInvites([]);
          setFirms([]);
          setFirm("");
          setError(fr ? "Invitation indisponible ou expirée." : "Invitation unavailable or expired.");
          await load({ keepError: true });
          if (epoch !== authEpoch.current) return;
          return;
        }
      }

      const { error: failure } = await db.rpc("decide_invitation", {
        p_invitation_id: id, p_action: action,
      });
      if (epoch !== authEpoch.current) return;
      await load();
      if (epoch !== authEpoch.current) return;
      if (failure) setError(fr ? "Action refusée ou invitation expirée." : "Action refused or invitation expired.");
    } catch {
      if (epoch === authEpoch.current) setError(fr ? "Impossible de vérifier les invitations. Actualisez la page." : "Unable to verify invitations. Refresh the page.");
    } finally {
      finishMutation(epoch);
    }
  }

  async function requestFirm() {
    // Cached session and directory choices are only initial UI eligibility,
    // not authorization after a taxpayer account switch or directory change.
    if (side !== "taxpayer" || !userId || !taxpayerId || !firm || busy ||
        !firms.some((candidate) => candidate.id === firm)) return;
    const requestedFirm = firm;
    const requestedTaxpayer = taxpayerId;
    const epoch = authEpoch.current;
    if (!beginMutation()) return;
    setError("");
    try {
      const db = supabase();
      const rejectStale = async () => {
        // Hide a no-longer-authorized directory and its prior invitation rows.
        setInvites([]);
        setFirms([]);
        setFirm("");
        setError(fr ? "Demande refusée. Vérifiez votre compte." : "Request refused. Check your account.");
        await load({ keepError: true });
      };

      const { data: liveAuth, error: liveAuthError } = await db.auth.getUser();
      if (epoch !== authEpoch.current) return;
      if (liveAuthError || !liveAuth.user || liveAuth.user.id !== userId) {
        await rejectStale();
        return;
      }

      // sessionTaxpayerId verifies the selected taxpayer through current RLS,
      // rather than trusting the value cached in browser session storage.
      const liveTaxpayerId = await sessionTaxpayerId();
      if (epoch !== authEpoch.current) return;
      if (liveTaxpayerId !== requestedTaxpayer) {
        await rejectStale();
        return;
      }

      // A firm removed from the directory must not be requested using an
      // obsolete dropdown option. The RPC still enforces transactional grants.
      const { data: liveDirectory, error: liveDirectoryError } = await db.rpc("firm_directory");
      if (epoch !== authEpoch.current) return;
      if (liveDirectoryError || !Array.isArray(liveDirectory) ||
          !liveDirectory.some((candidate) => candidate.id === requestedFirm)) {
        await rejectStale();
        return;
      }

      const { error: failure } = await db.rpc("create_invitation", {
        p_direction: "taxpayer_to_firm", p_organization_id: requestedFirm,
        p_taxpayer_id: requestedTaxpayer, p_contact_id: null,
      });
      if (epoch !== authEpoch.current) return;
      await load();
      if (epoch !== authEpoch.current) return;
      if (failure) setError(fr ? "Demande refusée. Vérifiez votre compte." : "Request refused. Check your account.");
    } catch {
      if (epoch === authEpoch.current) setError(fr ? "Impossible de vérifier la demande. Actualisez la page." : "Unable to verify the request. Refresh the page.");
    } finally {
      finishMutation(epoch);
    }
  }

  async function inviteContact() {
    // A cached draft or user ID cannot authorize an invitation after a
    // session switch, engagement revocation or firm membership deactivation.
    if (side !== "firm" || !userId || !engagement || !recipientEmail.trim() || busy ||
        !drafts.some((candidate) => candidate.id === engagement)) return;
    const selectedDraft = drafts.find((candidate) => candidate.id === engagement);
    if (!selectedDraft) return;
    const epoch = authEpoch.current;
    if (!beginMutation()) return;
    setError("");
    const db = supabase();
    const rejectStale = async () => {
      // Hide the prior authorized snapshot before any asynchronous refresh.
      setInvites([]);
      setDrafts([]);
      setFirms([]);
      setEngagement("");
      setRecipientEmail("");
      setError(fr
        ? "Destinataire indisponible. Vérifiez le compte client et l'adresse."
        : "Recipient unavailable. Check the client account and email.");
      await load({ keepError: true });
      finishMutation(epoch);
    };

    const { data: liveAuth, error: liveAuthError } = await db.auth.getUser();
    if (epoch !== authEpoch.current) return;
    if (liveAuthError || !liveAuth.user || liveAuth.user.id !== userId) {
      await rejectStale();
      return;
    }

    const { data: liveDraft, error: liveDraftError } = await db
      .from("engagements")
      .select("id,taxpayer_id,organization_id,status,revoked_at")
      .eq("id", engagement).maybeSingle();
    if (epoch !== authEpoch.current) return;
    if (liveDraftError || !liveDraft ||
        liveDraft.taxpayer_id !== selectedDraft.taxpayer_id ||
        // A multi-firm operator must not silently invite through a different
        // firm if this engagement was reassigned after the form loaded.
        liveDraft.organization_id !== selectedDraft.organization_id ||
        liveDraft.revoked_at ||
        (liveDraft.status !== "draft" && liveDraft.status !== "invited")) {
      await rejectStale();
      return;
    }

    // The RLS-visible engagement alone does not prove that this user still
    // belongs to the receiving firm. Recheck active membership as well.
    const { data: liveMembers, error: liveMemberError } = await db
      .from("firm_members")
      .select("id")
      .eq("organization_id", liveDraft.organization_id)
      .eq("auth_user_id", userId)
      .eq("active", true)
      .is("deactivated_at", null)
      .limit(1);
    if (epoch !== authEpoch.current) return;
    if (liveMemberError || !liveMembers?.length) {
      await rejectStale();
      return;
    }

    // The database RPC remains the transactional authorization authority.
    const { error: failure } = await db.rpc("create_invitation_for_contact", {
      p_engagement_id: engagement, p_email: recipientEmail.trim(),
    });
    if (epoch !== authEpoch.current) return;
    if (!failure) setRecipientEmail("");
    await load();
    if (epoch !== authEpoch.current) return;
    if (failure) setError(fr
      ? "Destinataire indisponible. Vérifiez le compte client et l'adresse."
      : "Recipient unavailable. Check the client account and email.");
    finishMutation(epoch);
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
