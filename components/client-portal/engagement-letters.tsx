"use client";

import { useCallback, useEffect, useState } from "react";
import { usePortalCopy } from "@/components/client-portal/copy";
import {
  EmptyState,
  LoadingRows,
  OfflineNote,
  PageHeading,
  PrimaryButton,
  formatFullDate,
  xaf,
} from "@/components/client-portal/ui";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { sessionTaxpayerId, supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";

/**
 * "Ma lettre de mission" -- the terms, and the one place a client agrees.
 *
 * A client accepting an engagement was accepting `scope_note`: one line,
 * copied out of a template's letter at instantiation while the rest was
 * discarded. Nothing to read before agreeing; nothing afterwards saying what
 * had been agreed to.
 *
 * Four states, deliberately not collapsed. No letter yet (said plainly: a
 * blank panel reads as "loading"). Accepted with no letter on file, which is
 * a real state for an engagement that predates them, not an error. On the
 * table, with scope, fee and body shown in full BEFORE the button, because a
 * button above the terms is a button pressed without them. Accepted, with the
 * date and the version, so a client can see a year later what they agreed to.
 *
 * The client writes `status` and `accepted_at` and nothing else. The guard
 * refuses an update that also moves the fee or the scope, and fills
 * `accepted_letter_id` itself -- so this screen never sends which letter it
 * believes is current. A screen holding a stale list must not be able to
 * record consent to terms that have since been replaced.
 */
type Engagement = {
  id: string;
  status: string;
  scope_note: string | null;
  fee_xaf: number | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

type Letter = {
  id: string;
  engagement_id: string;
  version: number;
  body: Record<string, unknown> | null;
  scope: string | null;
  fee_xaf: number | null;
  issued_at: string;
  superseded_at: string | null;
};

/** A letter body's sections, in the order a letter is read. */
const SECTIONS = ["scope", "responsibilities", "fees", "duration", "terms"] as const;

export function EngagementLetters({ locale }: { locale: "fr" | "en" }) {
  const copy = usePortalCopy();
  const toast = useToast();
  const [rows, setRows] = useState<Engagement[] | null>(null);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const taxpayerId = await sessionTaxpayerId();
      if (!taxpayerId) {
        setOffline(true);
        setRows([]);
        return;
      }
      const eng = await db
        .from("engagements")
        .select("id, status, scope_note, fee_xaf, accepted_at, revoked_at")
        .eq("taxpayer_id", taxpayerId)
        .is("revoked_at", null);
      if (eng.error) throw eng.error;
      const list = (eng.data ?? []) as Engagement[];
      setRows(list);
      if (list.length > 0) {
        const lt = await db
          .from("engagement_letters")
          .select("id, engagement_id, version, body, scope, fee_xaf, issued_at, superseded_at")
          .in("engagement_id", list.map((e) => e.id))
          .order("version", { ascending: false });
        setLetters((lt.data ?? []) as Letter[]);
      } else setLetters([]);
      setOffline(false);
    } catch {
      setOffline(true);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(engagementId: string) {
    setBusy(engagementId);
    try {
      const { data, error } = await supabase()
        .from("engagements")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", engagementId)
        .select("id");
      // A write RLS refused matches zero rows and returns no error. It must
      // not be shown as an acceptance.
      if (error || !data || data.length === 0) {
        toast(copy.letterAcceptFailed, "error");
        return;
      }
      toast(copy.letterAccepted);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeading title={copy.letterTitle} subtitle={copy.letterSubtitle} />
        <LoadingRows label={copy.loading} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={copy.letterTitle} subtitle={copy.letterSubtitle} />
      {offline && <OfflineNote>{copy.offline}</OfflineNote>}

      {rows.length === 0 ? (
        <EmptyState title={copy.letterNoEngagement} hint={copy.letterNoEngagementHint} />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((e) => {
            const live = letters.find((l) => l.engagement_id === e.id && !l.superseded_at);
            const accepted = Boolean(e.accepted_at);
            const tone: StatusTone = accepted ? "confirmed" : live ? "attention" : "neutral";
            const state = accepted
              ? copy.letterStateAccepted
              : live
                ? copy.letterStateToAccept
                : copy.letterStateNone;
            return (
              <li key={e.id} className="rounded-card border border-border bg-white p-6 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="font-display text-base font-semibold text-fg">
                    {live?.scope ?? e.scope_note ?? copy.letterUntitled}
                  </h2>
                  <StatusPill tone={tone}>{state}</StatusPill>
                </div>

                {!live ? (
                  <p className="mt-3 text-sm text-fg-muted">
                    {accepted ? copy.letterNotIssuedAccepted : copy.letterNotIssued}
                  </p>
                ) : (
                  <>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                      <Fact label={copy.letterVersion} value={`v${live.version}`} />
                      <Fact label={copy.letterIssued} value={formatFullDate(live.issued_at, locale)} />
                      <Fact
                        label={copy.letterFee}
                        value={live.fee_xaf === null ? copy.letterFeeUnset : xaf(live.fee_xaf, locale)}
                      />
                    </dl>

                    {SECTIONS.map((key) => {
                      const text = live.body?.[key];
                      if (typeof text !== "string" || text.trim() === "") return null;
                      return (
                        <section key={key} className="mt-4">
                          <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                            {copy.letterSections[key]}
                          </h3>
                          <p className="mt-1 whitespace-pre-line text-sm text-fg">{text}</p>
                        </section>
                      );
                    })}

                    {accepted ? (
                      <p className="mt-5 text-sm font-medium text-success-text">
                        {copy.letterAcceptedOn} {formatFullDate(e.accepted_at, locale)}
                      </p>
                    ) : (
                      <div className="mt-5 flex flex-col items-start gap-2 border-t border-border pt-4">
                        {/* The button comes after the terms, never above them. */}
                        <p className="text-xs text-fg-muted">{copy.letterAcceptNote}</p>
                        <PrimaryButton disabled={busy === e.id} onClick={() => void accept(e.id)}>
                          {busy === e.id ? copy.saving : copy.letterAccept}
                        </PrimaryButton>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-fg">{value}</dd>
    </div>
  );
}
