"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { updateById } from "@/lib/db-write";
import { memberFromSession, subscribeFirmSession, type FirmSession } from "@/lib/firm-auth";
import { can } from "@/lib/permissions";
import {
  breachesFirstResponse,
  channelLabel,
  completeness,
  nextStates,
  statusLabel,
  transition,
  type IntakeChannel,
  type Registration,
  type RegistrationStatus,
} from "@/lib/registration";
import { supabase } from "@/lib/supabase";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";

type Dict = ReturnType<typeof getWorkspaceDictionary>["leads"];

const STATUSES: RegistrationStatus[] = [
  "submitted",
  "verifying",
  "needs_info",
  "approved",
  "rejected",
  "withdrawn",
];

/**
 * Intake triage over `registrations`.
 *
 * Moves call `transition()`. Completeness is advisory. A first response past
 * 24 hours is amber, beside the row. Opening a file uses `engagement.create`,
 * the capability that already exists for that act.
 */
export function LeadsWorkspace({ locale, t }: { locale: "fr" | "en"; t: Dict }) {
  const toast = useToast();
  const [rows, setRows] = useState<Registration[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<RegistrationStatus | "all">("all");
  const [session, setSession] = useState<FirmSession | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => subscribeFirmSession(setSession), []);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase()
        .from("registrations")
        .select(
          "id, applicant_name, applicant_email, applicant_phone, taxpayer_type, legal_name, declared_niu, declared_regime, declared_centre, identity_document_ref, intake_channel, preferred_language, status, submitted_at, first_response_at, decided_at, info_requests, activated_at, decided_by, decision_note, taxpayer_id",
        )
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      setRows((data ?? []) as Registration[]);
      setOffline(false);
    } catch {
      setOffline(true);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mayMove = useMemo(() => {
    if (!session) return false;
    return can({ kind: "firm", member: memberFromSession(session) }, "engagement.create").ok;
  }, [session]);

  const shown = (rows ?? []).filter((r) => filter === "all" || r.status === filter);

  async function move(row: Registration, to: RegistrationStatus) {
    if (!session) {
      toast(t.signIn, "error");
      return;
    }
    if (!mayMove) {
      toast(t.notPermitted, "error");
      return;
    }
    const result = transition(row, {
      to,
      by: session.personLabel,
      note: notes[row.id],
      taxpayerId: files[row.id]?.trim() || undefined,
    });
    if (!result.ok) {
      toast(
        result.reason === "reason_required"
          ? t.noteRequired
          : result.reason === "file_required"
            ? t.fileRequired
            : t.failed,
        "error",
      );
      return;
    }
    setBusy(row.id);
    const written = await updateById("registrations", row.id, result.patch);
    setBusy(null);
    if (!written.ok) {
      toast(t.notPermitted, "error");
      return;
    }
    toast(t.moved);
    void load();
  }

  return (
    <div className="flex flex-col gap-4">
      {!session && (
        <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text">
          {t.signIn}
        </p>
      )}
      <p className="text-xs text-fg-subtle">{t.advisory}</p>
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={t.filterAll} />
        {STATUSES.map((status) => (
          <FilterChip
            key={status}
            active={filter === status}
            onClick={() => setFilter(status)}
            label={statusLabel(status, locale)}
          />
        ))}
      </div>
      {offline && <p className="text-sm text-amber-text">{t.offline}</p>}
      {rows === null ? (
        <div className="h-24 animate-pulse rounded-card bg-surface-sunken" />
      ) : shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
          {t.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((row) => {
            const draft = {
              applicant_name: row.applicant_name,
              applicant_email: row.applicant_email ?? "",
              applicant_phone: row.applicant_phone ?? "",
              taxpayer_type: row.taxpayer_type,
              legal_name: row.legal_name ?? "",
              declared_niu: row.declared_niu ?? "",
              intake_channel: row.intake_channel,
              preferred_language: row.preferred_language,
            };
            const score = completeness(draft);
            const late = breachesFirstResponse(row);
            const moves = nextStates(row.status);
            return (
              <li key={row.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-base font-semibold text-fg">{row.applicant_name}</p>
                    <p className="text-xs text-fg-muted">
                      {channelLabel(row.intake_channel as IntakeChannel, locale)} ·{" "}
                      {statusLabel(row.status, locale)}
                    </p>
                  </div>
                  {late && (
                    <span className="rounded-full border border-amber/50 bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-text">
                      {t.breach}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-fg-subtle">
                  {t.completeness}: {score.score}%
                  {score.missing.length > 0 && ` · ${t.missing}: ${score.missing.join(", ")}`}
                </p>
                {moves.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {(moves.includes("rejected") || moves.includes("approved")) && (
                      <label className="flex flex-col gap-1 text-xs text-fg-muted">
                        {moves.includes("approved") ? t.taxpayerId : t.note}
                        <input
                          value={moves.includes("approved") ? (files[row.id] ?? "") : (notes[row.id] ?? "")}
                          onChange={(e) =>
                            moves.includes("approved")
                              ? setFiles((prev) => ({ ...prev, [row.id]: e.target.value }))
                              : setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg"
                        />
                      </label>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {moves.map((to) => (
                        <button
                          key={to}
                          type="button"
                          disabled={!mayMove || busy === row.id}
                          onClick={() => void move(row, to)}
                          className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-3 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-50"
                        >
                          {statusLabel(to, locale)}
                        </button>
                      ))}
                    </div>
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

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[44px] items-center rounded-full border px-3 text-sm font-semibold ${
        active ? "border-navy bg-navy text-surface" : "border-border bg-surface text-fg-muted"
      }`}
    >
      {label}
    </button>
  );
}
