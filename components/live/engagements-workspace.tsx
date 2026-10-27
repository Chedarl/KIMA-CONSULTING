"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Engagement } from "@/lib/cases";
import { updateById } from "@/lib/db-write";
import {
  authorizeEngagement,
  draftEngagement,
  ENGAGEMENT_REFUSAL_LABELS,
  engagementPosture,
  postureLabel,
  revokeEngagement,
  type EngagementEvent,
  type EngagementPosture,
} from "@/lib/engagements";
import { memberFromSession, subscribeFirmSession, type FirmSession } from "@/lib/firm-auth";
import { formatXaf } from "@/lib/i18n";
import { can, denialLabel, type Actor } from "@/lib/permissions";
import { recordCaseEvent } from "@/lib/record-event";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";

/**
 * The firm's engagements, one list.
 *
 * Client 360 still shows the missions of one taxpayer. This is the book.
 * Authorise and revoke go through the same timestamps `authorityCheck` reads.
 * Creating a mission leaves it unauthorised until somebody with
 * `engagement.authorize` records that fact.
 */
export type EngagementLabels = {
  signIn: string;
  filterAll: string;
  empty: string;
  scope: string;
  noScope: string;
  fee: string;
  noFee: string;
  assigned: string;
  unassigned: string;
  authorisedOn: string;
  acceptedOn: string;
  notAccepted: string;
  revokedOn: string;
  authorise: string;
  revoke: string;
  reason: string;
  reasonPh: string;
  create: string;
  cancel: string;
  createTitle: string;
  client: string;
  service: string;
  scopeNote: string;
  feeField: string;
  submit: string;
  created: string;
  authorisedToast: string;
  revokedToast: string;
  failed: string;
  historyFailed: string;
  retryHistory: string;
  wrongOrg: string;
  offline: string;
  openClient: string;
  noOrg: string;
  chooseClient: string;
  noClients: string;
};

type Row = Engagement & { organization_id: string };
type Client = { id: string; legal_name: string };

const money = (fee: number, locale: "fr" | "en") => `${formatXaf(fee, locale)} XAF`;

export function EngagementsWorkspace({
  locale,
  labels,
}: {
  locale: "fr" | "en";
  labels: EngagementLabels;
}) {
  const toast = useToast();
  const [session, setSession] = useState<FirmSession | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [filter, setFilter] = useState<EngagementPosture | "all">("all");
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [historyGap, setHistoryGap] = useState<Record<string, EngagementEvent>>({});
  const [draft, setDraft] = useState({
    taxpayerId: "",
    serviceCode: "",
    scopeNote: "",
    fee: "",
    assignedTo: "",
  });

  useEffect(() => subscribeFirmSession(setSession), []);

  const actor = useMemo<Actor | null>(() => {
    if (!session || !rows) return session ? { kind: "firm", member: memberFromSession(session) } : null;
    const member = memberFromSession(session);
    return {
      kind: "firm",
      member,
      assignedTaxpayerIds: rows
        .filter((e) => e.assigned_to && e.assigned_to === member.person_label)
        .map((e) => e.taxpayer_id),
    };
  }, [session, rows]);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const [eng, tp] = await Promise.all([
        db.from("engagements").select("*").order("authorized_at", { ascending: false }),
        db.from("taxpayers").select("id, legal_name").order("legal_name"),
      ]);
      if (eng.error || tp.error) throw eng.error ?? tp.error;
      setRows((eng.data ?? []) as Row[]);
      setClients((tp.data ?? []) as Client[]);
      setOffline(false);
    } catch {
      setOffline(true);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const names = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.legal_name])),
    [clients],
  );
  const visibleClients = clients.filter((c) => actor && can(actor, "case.view", c.id).ok);

  const shown = (rows ?? []).filter((r) => {
    if (!actor || !can(actor, "case.view", r.taxpayer_id).ok) return false;
    return filter === "all" || engagementPosture(r) === filter;
  });

  async function writeHistory(row: Row, event: EngagementEvent): Promise<boolean> {
    if (!session) return false;
    const logged = await recordCaseEvent({
      taxpayerId: row.taxpayer_id,
      organizationId: row.organization_id,
      actor: { role: session.role, label: session.personLabel },
      kind: event.kind,
      to: event.to,
      subject: event.subject,
      reason: event.reason,
    });
    if (!logged.ok) {
      setHistoryGap((prev) => ({ ...prev, [row.id]: event }));
      toast(labels.historyFailed, "error");
      return false;
    }
    setHistoryGap((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    return true;
  }

  function refuse(capability: "engagement.create" | "engagement.authorize" | "engagement.revoke", taxpayerId?: string) {
    if (!actor) {
      toast(labels.signIn, "error");
      return true;
    }
    const verdict = can(actor, capability, taxpayerId);
    if (!verdict.ok) {
      toast(denialLabel(verdict.reason, locale), "error");
      return true;
    }
    return false;
  }

  async function authorise(row: Row) {
    if (!session) {
      toast(labels.signIn, "error");
      return;
    }
    if (refuse("engagement.authorize", row.taxpayer_id)) return;
    const result = authorizeEngagement(row);
    if (!result.ok) {
      const text = ENGAGEMENT_REFUSAL_LABELS[result.reason];
      toast(locale === "fr" ? text.fr : text.en, "error");
      return;
    }
    setBusy(row.id);
    const written = await updateById("engagements", row.id, result.patch);
    if (!written.ok) {
      setBusy(null);
      toast(labels.failed, "error");
      return;
    }
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, ...result.patch } : r)) ?? prev);
    const logged = await writeHistory(row, result.event);
    setBusy(null);
    if (logged) {
      toast(labels.authorisedToast);
      void load();
    }
  }

  async function revoke(row: Row) {
    if (!session) {
      toast(labels.signIn, "error");
      return;
    }
    if (refuse("engagement.revoke", row.taxpayer_id)) return;
    const result = revokeEngagement(row, reasons[row.id] ?? "");
    if (!result.ok) {
      const text = ENGAGEMENT_REFUSAL_LABELS[result.reason];
      toast(locale === "fr" ? text.fr : text.en, "error");
      return;
    }
    setBusy(row.id);
    const written = await updateById("engagements", row.id, result.patch);
    if (!written.ok) {
      setBusy(null);
      toast(labels.failed, "error");
      return;
    }
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, ...result.patch } : r)) ?? prev);
    const logged = await writeHistory(row, result.event);
    setBusy(null);
    if (logged) {
      toast(labels.revokedToast);
      void load();
    }
  }

  async function retryHistory(row: Row) {
    const pending = historyGap[row.id];
    if (!session) {
      toast(labels.signIn, "error");
      return;
    }
    if (!pending) return;
    setBusy(row.id);
    const ok = await writeHistory(row, pending);
    setBusy(null);
    if (!ok) return;
    toast(pending.kind === "engagement_revoked" ? labels.revokedToast : labels.authorisedToast);
  }

  async function create() {
    const feeText = draft.fee.trim();
    let feeXaf: number | null = null;
    if (feeText) {
      if (!/^\d+$/.test(feeText)) {
        const text = ENGAGEMENT_REFUSAL_LABELS.fee_invalid;
        toast(locale === "fr" ? text.fr : text.en, "error");
        return;
      }
      feeXaf = Number.parseInt(feeText, 10);
    }
    const built = draftEngagement({
      taxpayerId: draft.taxpayerId,
      serviceCode: draft.serviceCode,
      scopeNote: draft.scopeNote,
      feeXaf,
      assignedTo: draft.assignedTo || session?.personLabel || null,
    });
    if (!built.ok) {
      const text = ENGAGEMENT_REFUSAL_LABELS[built.reason];
      toast(locale === "fr" ? text.fr : text.en, "error");
      return;
    }
    if (!session) {
      toast(labels.signIn, "error");
      return;
    }
    if (refuse("engagement.create", built.row.taxpayer_id)) return;
    const orgFromRow = rows?.find((r) => r.taxpayer_id === built.row.taxpayer_id)?.organization_id;
    setBusy("create");
    try {
      const db = supabase();
      const { data: member, error: memberError } = await db
        .from("firm_members")
        .select("organization_id")
        .eq("id", session.memberId)
        .maybeSingle();
      if (memberError) throw memberError;
      const memberOrg = (member?.organization_id as string | undefined) ?? null;
      if (orgFromRow && memberOrg && orgFromRow !== memberOrg) {
        toast(labels.wrongOrg, "error");
        return;
      }
      const organizationId = orgFromRow ?? memberOrg;
      if (!organizationId) {
        toast(labels.noOrg, "error");
        return;
      }
      const { error } = await db.from("engagements").insert({
        ...built.row,
        organization_id: organizationId,
      });
      if (error) throw error;
      toast(labels.created);
      setCreating(false);
      setDraft({ taxpayerId: "", serviceCode: "", scopeNote: "", fee: "", assignedTo: "" });
      await load();
    } catch {
      toast(labels.failed, "error");
    } finally {
      setBusy(null);
    }
  }

  if (session === undefined) {
    return <div className="h-24 animate-pulse rounded-card bg-surface-sunken" aria-busy="true" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {session === null && (
        <p className="rounded-card border border-border bg-surface-sunken px-4 py-3 text-sm text-fg-muted">
          {labels.signIn}
        </p>
      )}
      <div role="group" aria-label={labels.filterAll} className="flex flex-wrap items-center gap-2">
        <Chip active={filter === "all"} label={labels.filterAll} onClick={() => setFilter("all")} />
        {(["awaiting_authorisation", "authorised", "revoked"] as const).map((p) => (
          <Chip
            key={p}
            active={filter === p}
            label={postureLabel(p, locale)}
            onClick={() => setFilter(p)}
          />
        ))}
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-3 text-sm font-semibold text-surface hover:opacity-90"
        >
          {creating ? labels.cancel : `+ ${labels.create}`}
        </button>
      </div>

      {creating && (
        <form
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h2 className="font-display text-base font-semibold text-fg">{labels.createTitle}</h2>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            {labels.client}
            <select
              required
              value={draft.taxpayerId}
              onChange={(e) => setDraft((d) => ({ ...d, taxpayerId: e.target.value }))}
              className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
            >
              <option value="">{visibleClients.length === 0 ? labels.noClients : labels.chooseClient}</option>
              {visibleClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            {labels.service}
            <input
              value={draft.serviceCode}
              onChange={(e) => setDraft((d) => ({ ...d, serviceCode: e.target.value }))}
              className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            {labels.scopeNote}
            <input
              value={draft.scopeNote}
              onChange={(e) => setDraft((d) => ({ ...d, scopeNote: e.target.value }))}
              className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            {labels.feeField}
            <input
              inputMode="numeric"
              value={draft.fee}
              onChange={(e) => setDraft((d) => ({ ...d, fee: e.target.value }))}
              className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            {labels.assigned}
            <input
              value={draft.assignedTo}
              placeholder={session?.personLabel ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, assignedTo: e.target.value }))}
              className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
            />
          </label>
          <button
            type="submit"
            disabled={busy === "create"}
            className="inline-flex min-h-[44px] items-center self-start rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-50"
          >
            {labels.submit}
          </button>
        </form>
      )}

      {session && offline && <p className="text-sm text-amber-text">{labels.offline}</p>}
      {session && !offline && rows === null && (
        <div className="h-24 animate-pulse rounded-card bg-surface-sunken" aria-busy="true" />
      )}
      {session && !offline && rows && shown.length === 0 && (
        <p className="rounded-card border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
          {labels.empty}
        </p>
      )}
      {session && !offline && rows && shown.length > 0 && (
        <ul className="flex flex-col gap-3">
          {shown.map((row) => {
            const posture = engagementPosture(row);
            const alert = posture === "revoked";
            return (
              <li key={row.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-base font-semibold text-fg">
                      {names[row.taxpayer_id] ?? labels.client}
                    </p>
                    <p className={`text-xs ${alert ? "font-semibold text-amber-text" : "text-fg-muted"}`}>
                      {postureLabel(posture, locale)}
                    </p>
                  </div>
                  <Link
                    href={`/${locale}/workspace/clients/${row.taxpayer_id}`}
                    className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-text"
                  >
                    {labels.openClient}
                  </Link>
                </div>
                <p className="mt-2 text-xs text-fg-muted">
                  {labels.scope}: {row.scope_note ?? row.service_code ?? labels.noScope}
                </p>
                <p className="tnum text-xs text-fg-subtle">
                  {labels.fee}: {row.fee_xaf == null ? labels.noFee : money(row.fee_xaf, locale)}
                  {" · "}
                  {labels.assigned}: {row.assigned_to ?? labels.unassigned}
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  {row.authorized_at ? `${labels.authorisedOn} ${row.authorized_at.slice(0, 10)}` : ""}
                  {row.authorized_at ? " · " : ""}
                  {row.accepted_at
                    ? `${labels.acceptedOn} ${row.accepted_at.slice(0, 10)}`
                    : labels.notAccepted}
                  {row.revoked_at ? ` · ${labels.revokedOn} ${row.revoked_at.slice(0, 10)}` : ""}
                </p>
                {historyGap[row.id] && (
                  <div className="mt-3 flex flex-col items-start gap-2">
                    <p className="text-xs font-semibold text-amber-text">{labels.historyFailed}</p>
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void retryHistory(row)}
                      className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-3 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-50"
                    >
                      {labels.retryHistory}
                    </button>
                  </div>
                )}
                {posture !== "revoked" && (
                  <div className="mt-3 flex flex-col gap-2">
                    {posture === "awaiting_authorisation" && (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void authorise(row)}
                        className="inline-flex min-h-[44px] items-center self-start rounded-lg bg-teal-text px-3 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-50"
                      >
                        {labels.authorise}
                      </button>
                    )}
                    <label className="flex flex-col gap-1 text-xs text-fg-muted">
                      {labels.reason}
                      <input
                        value={reasons[row.id] ?? ""}
                        placeholder={labels.reasonPh}
                        onChange={(e) => setReasons((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void revoke(row)}
                      className="inline-flex min-h-[44px] items-center self-start rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-fg hover:bg-surface-sunken disabled:opacity-50"
                    >
                      {labels.revoke}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[44px] items-center rounded-full border px-3 text-sm font-semibold ${
        active ? "border-navy bg-navy text-surface" : "border-border bg-surface text-fg-muted"
      }`}
    >
      {label}
    </button>
  );
}
