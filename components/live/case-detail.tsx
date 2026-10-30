"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader } from "@/components/ui";
import type { getWorkspaceDictionary } from "@/lib/i18n-workspace";
import {
  STAGE_LABELS,
  advance,
  advanceRefusalLabel,
  authorityCheck,
  authorityLabel,
  awaitingClient,
  billingLabel,
  clientStatus,
  clientStatusLabel,
  deriveBlocker,
  filingLabel,
  isClosed,
  nextStages,
  obligationLabel,
  paymentLabel,
  requestIsOutstanding,
  requestStatusLabel,
  stageLabel,
  waitsOn,
  type AdvanceInput,
  type CaseRequest,
  type CaseStage,
  type CaseTask,
  type ComplianceCase,
  type Engagement,
} from "@/lib/cases";
import { caseFindings, type CaseTaxpayer } from "@/lib/case-diagnostics";
import { commandAdvanceCase } from "@/lib/commands";
import { updateById } from "@/lib/db-write";
import {
  memberFromSession,
  subscribeFirmSession,
  type FirmSession,
} from "@/lib/firm-auth";
import type { Finding } from "@/lib/diagnostics";
import {
  describe,
  drift,
  eventFromRequest,
  noteEvent,
  timeline,
  type CaseEvent,
} from "@/lib/events";
import {
  approvalLabel,
  can,
  canApproveReview,
  denialLabel,
  requiresSecondReview,
  type Actor,
  type Capability,
  type FirmMember,
} from "@/lib/permissions";

/**
 * One compliance case, from the firm's side — screen 06.
 *
 * This is where the engines stop being libraries and become a workflow. Every
 * button asks the same function the harnesses ask: a stage move is
 * `commandAdvanceCase()` (capability + `advance()` + events), the review gate
 * is `canApproveReview()`, the checks are `caseFindings()`. NOTHING ON THIS PAGE DECIDES ANYTHING
 * ITSELF. A surface that re-derived a rule would be a second opinion, and the
 * second opinion is always the one that goes stale.
 *
 * A REFUSAL IS SHOWN BEFORE IT IS ATTEMPTED. The screen runs the gate, and
 * where it refuses it disables the button and prints the reason. A disabled
 * control with no explanation teaches a practitioner nothing except that the
 * software is unpredictable.
 *
 * THE ACTOR IS CHOSEN, NOT AUTHENTICATED. Firm sign-in does not exist yet
 * (`firm_members.auth_user_id` is in the schema; nothing fills it), so the page
 * asks who you are and uses that for every permission and separation-of-duties
 * decision. It says so on screen rather than implying a session it does not
 * have — and the capability checks it drives are the real ones, which is why
 * choosing the preparer and then trying to pass their own review is refused
 * here exactly as the database would refuse it.
 */
type Dict = ReturnType<typeof getWorkspaceDictionary>;

type Taxpayer = CaseTaxpayer & { id: string; legal_name: string };

const CASE_COLUMNS =
  "id, taxpayer_id, engagement_id, obligation_code, period_token, due_on, due_needs_confirmation, due_basis, stage, owner, blocker, opened_at, closed_at, filing_status, filing_reference, filing_evidence_ref, filing_attempted_at, filing_verified_at, payment_evidence_status, billing_status, prepared_by, prepared_at, approved_by, approved_at, self_approved";

const EVENT_COLUMNS =
  "id, case_id, occurred_at, dimension, kind, actor_role, actor_label, from_value, to_value, subject_ref, reason, visibility";

const STAGE_RAIL: CaseStage[] = [
  "documents",
  "accounting",
  "preparation",
  "review",
  "filing",
  "evidence",
  "delivered",
];

const btn =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = `${btn} bg-teal-text text-surface hover:opacity-90`;
const btnSecondary = `${btn} border border-border-strong bg-surface text-fg hover:bg-surface-sunken`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{children}</dd>
    </div>
  );
}

/** One of the four states. Each says what it is about, never what it implies. */
function Dimension({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

/**
 * The stage, in the firm's own sequence.
 *
 * The internal rail, deliberately: this is the screen the vocabulary split
 * exists FOR. The client's five states live on their own portal, and the one
 * place the two meet is the "client sees" field below.
 */
function StageRail({
  current,
  locale,
  stepWord,
}: {
  current: CaseStage;
  locale: "fr" | "en";
  stepWord: string;
}) {
  if (current === "abandoned") {
    return (
      <p className="rounded-lg border border-border-strong bg-surface-sunken px-3 py-2 text-sm font-medium text-fg-muted">
        {stageLabel("abandoned", locale)}
      </p>
    );
  }
  const at = STAGE_RAIL.indexOf(current);
  const total = STAGE_RAIL.length;
  return (
    <div>
      <p role="status" className="text-xs font-semibold text-fg-subtle">
        {stepWord} {at + 1} / {total}
      </p>
      <ol className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {STAGE_RAIL.map((s, i) => {
          const here = i === at;
          const done = i < at;
          return (
            <li
              key={s}
              aria-current={here ? "step" : undefined}
              className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-2 ${
                here
                  ? "border-navy bg-navy text-surface"
                  : done
                    ? "border-teal/40 bg-teal-soft text-teal-text"
                    : "border-border bg-surface text-fg-subtle"
              }`}
            >
              <span className="font-mono text-xs">{i + 1}</span>
              <span className="text-xs font-semibold leading-tight">
                {locale === "fr" ? STAGE_LABELS[s].fr : STAGE_LABELS[s].en}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CaseDetail({
  caseId,
  locale,
  t,
  queueHref,
}: {
  caseId: string;
  locale: "fr" | "en";
  t: Dict["caseDetail"];
  queueHref: string;
}) {
  const signInHref = `/${locale}/firm-login`;
  const [row, setRow] = useState<ComplianceCase | null>(null);
  const [taxpayer, setTaxpayer] = useState<Taxpayer | null>(null);
  const [engagement, setEngagement] = useState<(Engagement & { organization_id: string }) | null>(null);
  const [assignments, setAssignments] = useState<
    { taxpayer_id: string; assigned_to: string | null }[]
  >([]);
  const [requests, setRequests] = useState<CaseRequest[]>([]);
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [members, setMembers] = useState<FirmMember[]>([]);
  const [session, setSession] = useState<FirmSession | null>(null);
  const [disclose, setDisclose] = useState(false);
  const [tab, setTab] = useState<"firm" | "client">("firm");
  const [note, setNote] = useState("");
  const [noteClient, setNoteClient] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [askFr, setAskFr] = useState("");
  const [askEn, setAskEn] = useState("");
  const [askWho, setAskWho] = useState<"taxpayer" | "firm">("taxpayer");
  const [askDue, setAskDue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refusedBy, setRefusedBy] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [offline, setOffline] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const { data: c, error } = await db
        .from("compliance_cases")
        .select(CASE_COLUMNS)
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw error;
      if (!c) {
        setMissing(true);
        return;
      }
      const kase = c as unknown as ComplianceCase;
      setRow(kase);

      const [tp, eng, assigned, reqs, tsk, evs, mem] = await Promise.all([
        db
          .from("taxpayers")
          .select("id, legal_name, profile_verified, tax_centre, accounting_framework, tax_regime")
          .eq("id", kase.taxpayer_id)
          .maybeSingle(),
        kase.engagement_id
          ? db.from("engagements").select("*").eq("id", kase.engagement_id).maybeSingle()
          : Promise.resolve({ data: null }),
        db.from("engagements").select("taxpayer_id, assigned_to"),
        db
          .from("document_requests")
          .select(
            "id, case_id, taxpayer_id, label_fr, label_en, status, responsible, due_on, returned_count",
          )
          .eq("case_id", caseId)
          .order("due_on", { ascending: true }),
        db
          .from("case_tasks")
          .select(
            "id, case_id, title, detail, assigned_to, state, is_blocking, due_on, completed_at",
          )
          .eq("case_id", caseId)
          .order("due_on", { ascending: true }),
        db
          .from("case_events")
          .select(EVENT_COLUMNS)
          .eq("case_id", caseId)
          // The ordering contract `latestValue()` documents, so `drift()` can
          // be trusted: `occurred_at` alone is not a total order.
          .order("occurred_at", { ascending: true })
          .order("created_at", { ascending: true }),
        db.from("firm_members").select("id, person_label, role, active, deactivated_at"),
      ]);

      setTaxpayer((tp.data ?? null) as Taxpayer | null);
      setEngagement((eng.data ?? null) as (Engagement & { organization_id: string }) | null);
      setAssignments((assigned.data ?? []) as { taxpayer_id: string; assigned_to: string | null }[]);
      setRequests((reqs.data ?? []) as CaseRequest[]);
      setTasks((tsk.data ?? []) as CaseTask[]);
      setEvents((evs.data ?? []) as unknown as CaseEvent[]);
      // `email` is denied at the column to anybody who is not a firm member,
      // and this screen has no use for it.
      const roster = ((mem.data ?? []) as Omit<FirmMember, "email">[]).map((m) => ({
        ...m,
        email: null,
      }));
      setMembers(roster);
    } catch {
      // Nothing rather than something stale: this is the screen where somebody
      // decides whether work leaves the building.
      setOffline(true);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The signed-in member is who you are. There is no stand-in selector.
  useEffect(() => subscribeFirmSession(setSession), []);

  // The client acts on these same rows. A document arriving while an accountant
  // has the case open should appear without a refresh.
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | null = null;
    try {
      const db = supabase();
      channel = db
        .channel(`case-${caseId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "document_requests" }, () =>
          void load(),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "case_events" }, () =>
          void load(),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "compliance_cases" }, () =>
          void load(),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "case_tasks" }, () =>
          void load(),
        )
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
    } catch {
      setLive(false);
    }
    return () => {
      if (channel) void channel.unsubscribe();
    };
  }, [caseId, load]);

  const member = useMemo(() => {
    if (!session) return null;
    const signedIn = members.find((m) => m.id === session.memberId);
    // The roster is the authority on the role. Until it loads, the OTP
    // session is the member — never a colleague picked from a dropdown.
    if (signedIn) return signedIn.active ? signedIn : null;
    return memberFromSession(session);
  }, [session, members]);

  /**
   * A staff member's reach comes from the engagements assigned to them, not
   * from a list typed here. Absent assignment information denies — the rule
   * `can()` already follows.
   */
  const actor = useMemo<Actor | null>(() => {
    if (!member) return null;
    return {
      kind: "firm",
      member,
      assignedTaxpayerIds: assignments
        .filter((e) => e.assigned_to && e.assigned_to === member.person_label)
        .map((e) => e.taxpayer_id),
    };
  }, [member, assignments]);

  const allowed = useCallback(
    (capability: Capability) =>
      actor && row
        ? can(actor, capability, row.taxpayer_id)
        : ({ ok: false, reason: "role_lacks_capability" } as const),
    [actor, row],
  );

  const findings = useMemo<Finding[]>(
    () => (row && taxpayer ? caseFindings({ c: row, taxpayer, requests }) : []),
    [row, taxpayer, requests],
  );

  const approval = useMemo(
    () =>
      row && actor
        ? canApproveReview(row, actor, {
            requireSecondReview: requiresSecondReview(members),
            discloseSelfApproval: disclose,
          })
        : null,
    [row, actor, members, disclose],
  );

  const owed = useMemo(() => awaitingClient(requests), [requests]);
  const blocker = useMemo(() => deriveBlocker({ tasks, requests }), [tasks, requests]);
  const drifts = useMemo(() => (row ? drift(row, events) : []), [row, events]);

  // Two different questions, and the stricter one wins. The capability says
  // whether this role MAY read internal events; the session says whether the
  // server will serve any. Without a session the scoped-read policy returns
  // client rows only, so a page claiming to show everything would be showing a
  // filtered list under a label that says otherwise.
  const canSeeInternal = allowed("event.view_internal").ok && Boolean(session);
  const shown = useMemo(
    () => timeline(events, tab === "client" || !canSeeInternal ? "client" : "firm"),
    [events, tab, canSeeInternal],
  );

  const moveInput = useCallback(
    (to: CaseStage): AdvanceInput => ({
      to,
      by: member?.person_label ?? "",
      findings,
      requests,
      filing: row
        ? { filing_status: row.filing_status, payment_evidence_status: row.payment_evidence_status }
        : undefined,
      // Supplied only where the gate asks for it. Everywhere else no approval
      // decision has been taken, and pretending otherwise would be the bug.
      approval: to === "filing" && approval ? approval : undefined,
    }),
    [member, findings, requests, row, approval],
  );

  /** Ask the engine what would happen, so the screen can say so in advance. */
  const preview = useCallback(
    (to: CaseStage) => (row ? advance(row, moveInput(to)) : null),
    [row, moveInput],
  );

  async function move(to: CaseStage) {
    if (!row || !member || !actor) return;
    const result = commandAdvanceCase({
      current: row,
      advance: moveInput(to),
      eventActor: { role: member.role, label: member.person_label },
      authActor: actor,
      requireSecondReview: requiresSecondReview(members),
      discloseSelfApproval: disclose,
    });
    if (!result.ok) {
      setFailed(to);
      setRefusedBy(locale === "fr" ? result.reasonFr : result.reasonEn);
      return;
    }
    setBusy(to);
    setFailed(null);
    setRefusedBy(null);
    try {
      const written = await updateById("compliance_cases", row.id, result.patch);
      if (!written.ok) {
        setFailed(to);
        setRefusedBy(written.reason === "not_permitted" ? t.notPermitted : t.moveFailed);
        return;
      }
      const db = supabase();
      if (result.events.length > 0) {
        const { error: logError } = await db.from("case_events").insert(result.events);
        if (logError) throw logError;
      }
      await load();
    } catch {
      setFailed(to);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Accept or return one document.
   *
   * ACCEPTING IS A JUDGEMENT, and it is the firm's alone — the client portal
   * can only move a request as far as `submitted`. A return carries a reason
   * because the client will read it, and a return with no reason is how rework
   * becomes a guessing game.
   */
  async function settleRequest(r: CaseRequest, to: "accepted" | "returned") {
    if (!row || !member) return;
    const reason = (reasons[r.id] ?? "").trim();
    if (to === "returned" && !reason) {
      setFailed(r.id);
      return;
    }
    setBusy(r.id);
    setFailed(null);
    setRefusedBy(null);
    try {
      const patch =
        to === "returned" ? { status: to, returned_count: r.returned_count + 1 } : { status: to };
      const written = await updateById("document_requests", r.id, patch);
      if (!written.ok) {
        setFailed(r.id);
        setRefusedBy(written.reason === "not_permitted" ? t.notPermitted : t.moveFailed);
        return;
      }
      const db = supabase();
      const event = eventFromRequest(
        row.id,
        {
          from: r.status,
          to,
          label: locale === "fr" ? r.label_fr : r.label_en,
          reason: to === "returned" ? reason : null,
        },
        { role: member.role, label: member.person_label },
      );
      if (event) {
        const { error: logError } = await db.from("case_events").insert(event);
        if (logError) throw logError;
      }
      setReasons((prev) => ({ ...prev, [r.id]: "" }));
      await load();
    } catch {
      setFailed(r.id);
    } finally {
      setBusy(null);
    }
  }

  async function createRequest() {
    if (!row || !member) return;
    if (!askFr.trim() || !askEn.trim()) {
      setFailed("new-request");
      setRefusedBy(t.requestNeedLabel);
      return;
    }
    const gate = allowed("request.create");
    if (!gate.ok) {
      setFailed("new-request");
      setRefusedBy(denialLabel(gate.reason, locale));
      return;
    }
    setBusy("new-request");
    setFailed(null);
    setRefusedBy(null);
    try {
      const db = supabase();
      // The case's RLS-visible, active engagement is the only valid firm.
      // An arbitrary organization lookup can select an unrelated tenant.
      const orgId = engagement?.organization_id;
      if (!orgId || engagement.id !== row.engagement_id ||
          engagement.taxpayer_id !== row.taxpayer_id || engagement.revoked_at ||
          !["authorized", "accepted"].includes(engagement.status) ||
          !(engagement.authorized_at || engagement.accepted_at)) {
        throw new Error("No active engagement for this case");
      }
      const due =
        askDue ||
        (() => {
          const d = new Date();
          d.setDate(d.getDate() + 14);
          return d.toISOString().slice(0, 10);
        })();
      const { error } = await db.from("document_requests").insert({
        taxpayer_id: row.taxpayer_id,
        organization_id: orgId,
        case_id: row.id,
        label_fr: askFr.trim(),
        label_en: askEn.trim(),
        status: "requested",
        responsible: askWho,
        due_on: due,
        returned_count: 0,
      });
      if (error) throw error;
      const event = eventFromRequest(
        row.id,
        {
          from: null,
          to: "requested",
          label: locale === "fr" ? askFr.trim() : askEn.trim(),
        },
        { role: member.role, label: member.person_label },
      );
      if (event) {
        const { error: logError } = await db.from("case_events").insert(event);
        if (logError) throw logError;
      }
      setAskFr("");
      setAskEn("");
      await load();
    } catch {
      setFailed("new-request");
    } finally {
      setBusy(null);
    }
  }

  async function toggleTask(task: CaseTask) {
    setBusy(task.id);
    setFailed(null);
    setRefusedBy(null);
    try {
      const done = task.state === "done";
      const written = await updateById("case_tasks", task.id, {
        state: done ? "open" : "done",
        // The database refuses a done task with no time against it.
        completed_at: done ? null : new Date().toISOString(),
      });
      if (!written.ok) {
        setFailed(task.id);
        setRefusedBy(written.reason === "not_permitted" ? t.notPermitted : t.moveFailed);
        return;
      }
      await load();
    } catch {
      setFailed(task.id);
    } finally {
      setBusy(null);
    }
  }

  /** A note's audience is its content, which is why it is chosen and not derived. */
  async function saveNote() {
    if (!row || !member || !note.trim()) return;
    setBusy("note");
    setFailed(null);
    try {
      const event = noteEvent(
        row.id,
        { role: member.role, label: member.person_label },
        note,
        noteClient ? "client" : "internal",
      );
      const { error } = await supabase().from("case_events").insert(event);
      if (error) throw error;
      setNote("");
      await load();
    } catch {
      setFailed("note");
    } finally {
      setBusy(null);
    }
  }

  if (missing) {
    return (
      <Card className="p-6">
        <p className="text-sm text-fg-muted">{t.notFound}</p>
        <Link href={queueHref} className="mt-3 inline-block text-sm font-semibold text-navy">
          {t.back}
        </Link>
      </Card>
    );
  }

  if (!row) {
    return (
      <div className="flex flex-col gap-4">
        {offline && (
          <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text">
            {t.offline}
          </p>
        )}
        <div className="h-28 animate-pulse rounded-card bg-surface-sunken" />
        <div className="h-64 animate-pulse rounded-card bg-surface-sunken" />
      </div>
    );
  }

  const authority = authorityCheck(row, engagement);
  const moves = nextStages(row.stage);
  const advanceVerdict = allowed("case.advance");
  const blocking = findings.filter((f) => f.severity === "blocking");
  const advisory = findings.filter((f) => f.severity === "advisory");
  const label = (r: CaseRequest) => (locale === "fr" ? r.label_fr : r.label_en);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={queueHref} className="text-sm font-medium text-navy hover:underline">
            ← {t.back}
          </Link>
          <h1 className="mt-1 font-display text-2xl font-semibold text-fg sm:text-3xl">
            {taxpayer?.legal_name ?? row.taxpayer_id}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            {obligationLabel(row.obligation_code, locale)} · {t.period} {row.period_token}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          {session && (
            <p className="text-xs text-fg-subtle">
              {t.signedInAs}{" "}
              <span className="font-medium text-fg">{session.personLabel}</span> ·{" "}
              {session.role.replace("firm_", "").replace("kima_", "")}
            </p>
          )}
          {live && (
            <span className="inline-flex items-center gap-1.5 text-xs text-teal-text">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal" />
              {t.live}
            </span>
          )}
        </div>
      </div>

      {!session && (
        <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text">
          {t.actingAsHint}{" "}
          <Link href={signInHref} className="font-semibold text-teal-text underline-offset-2 hover:underline">
            {t.signIn}
          </Link>
        </p>
      )}

      {refusedBy && (
        <p
          role="status"
          className="rounded-card border border-danger-text/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger-text"
        >
          {refusedBy}
        </p>
      )}

      {offline && (
        <p className="rounded-card border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-amber-text">
          {t.offline}
        </p>
      )}

      {authority && (
        <p className="rounded-card border border-danger-text/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger-text">
          {authorityLabel(authority, locale)}
        </p>
      )}

      {drifts.length > 0 && (
        <Card className="border-danger-text/40">
          <CardHeader title={t.driftTitle} />
          <div className="p-4 text-sm sm:p-5">
            <p className="text-fg-muted">{t.driftHint}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {drifts.map((d) => (
                <li key={d.tracks} className="font-mono text-xs text-danger-text">
                  {d.tracks} — {t.driftRow}: {d.row} · {t.driftLog}: {d.log}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dimension
            label={t.dimWork}
            value={stageLabel(row.stage, locale)}
            tone={isClosed(row.stage) ? "text-teal-text" : "text-fg"}
          />
          <Dimension
            label={t.dimFiling}
            value={filingLabel(row.filing_status, locale)}
            tone={row.filing_status === "verified" ? "text-teal-text" : "text-fg"}
          />
          <Dimension
            label={t.dimPayment}
            value={paymentLabel(row.payment_evidence_status, locale)}
            tone="text-fg"
          />
          <Dimension
            label={t.dimBilling}
            value={billingLabel(row.billing_status, locale)}
            tone="text-fg"
          />
        </div>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-fg-subtle">{t.dimHint}</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t.stageTitle} />
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <StageRail current={row.stage} locale={locale} stepWord={t.step} />
              {requests.length > 0 ? (
                <p className="text-sm text-fg-muted">
                  {t.receivedCount}{" "}
                  <span className="tnum font-semibold text-fg">
                    {requests.filter((r) => r.status === "submitted").length}
                  </span>
                  {" · "}
                  {t.acceptedCount}{" "}
                  <span className="tnum font-semibold text-teal-text">
                    {requests.filter((r) => r.status === "accepted").length}
                  </span>
                  {" · "}
                  {t.owedCount}{" "}
                  <span className="tnum font-semibold text-amber-text">
                    {requests.filter((r) => requestIsOutstanding(r.status)).length}
                  </span>
                </p>
              ) : null}

              <dl className="grid gap-3 sm:grid-cols-3">
                <Field label={t.due}>
                  {row.due_on ? (
                    <span className="tnum font-mono">
                      {row.due_on}
                      {row.due_needs_confirmation && (
                        <span className="ml-1 text-xs text-amber-text">· {t.provisional}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-fg-muted">{t.noDue}</span>
                  )}
                </Field>
                <Field label={t.owner}>{row.owner ?? t.noOwner}</Field>
                <Field label={t.clientSees}>
                  {clientStatusLabel(clientStatus(row, owed), locale)}
                </Field>
              </dl>

              {blocker && (
                <p className="rounded-lg border border-amber/50 bg-amber-soft px-3 py-2 text-sm text-amber-text">
                  {locale === "fr" ? blocker.fr : blocker.en}
                </p>
              )}

              {moves.length === 0 ? (
                <p className="text-sm text-fg-muted">{t.noMoves}</p>
              ) : !advanceVerdict.ok ? (
                <p className="text-sm text-fg-muted">
                  {t.denied} {denialLabel(advanceVerdict.reason, locale)}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {moves.map((to) => {
                    const verdict = preview(to);
                    const refused = verdict && !verdict.ok ? verdict.reason : null;
                    return (
                      <div key={to} className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void move(to)}
                          disabled={!!refused || busy === to}
                          className={to === "abandoned" ? btnSecondary : btnPrimary}
                        >
                          {busy === to ? t.moving : `${t.moveTo} ${stageLabel(to, locale)}`}
                        </button>
                        {refused && (
                          <span className="text-xs leading-snug text-fg-muted">
                            {advanceRefusalLabel(refused, locale)}
                          </span>
                        )}
                        {failed === to && (
                          <span className="text-xs text-danger-text">{t.moveFailed}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.requestsTitle} />
            <div className="flex flex-col divide-y divide-border">
              {requests.length === 0 ? (
                <p className="p-4 text-sm text-fg-muted sm:p-5">{t.requestsEmpty}</p>
              ) : (
                requests.map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-fg">{label(r)}</p>
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          {requestStatusLabel(r.status, locale)} ·{" "}
                          {waitsOn(r) === "firm" ? t.waitingFirm : t.waitingClient}
                          {r.returned_count > 0 && ` · ×${r.returned_count}`}
                        </p>
                      </div>
                      <span className="tnum font-mono text-xs text-fg-subtle">{r.due_on}</span>
                    </div>

                    {r.status === "submitted" && (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void settleRequest(r, "accepted")}
                            disabled={busy === r.id || !allowed("document.review").ok}
                            className={btnPrimary}
                          >
                            {t.accept}
                          </button>
                          <button
                            type="button"
                            onClick={() => void settleRequest(r, "returned")}
                            disabled={busy === r.id || !allowed("request.return").ok}
                            className={btnSecondary}
                          >
                            {t.returnIt}
                          </button>
                        </div>
                        <label className="text-xs text-fg-subtle">
                          {t.returnReason}
                          <input
                            value={reasons[r.id] ?? ""}
                            onChange={(e) =>
                              setReasons((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            className="mt-1 min-h-[44px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg"
                          />
                        </label>
                        {failed === r.id && (
                          <p className="text-xs text-danger-text">{t.returnReasonRequired}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
              <form
                className="flex flex-col gap-2 border-t border-border p-4 sm:p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createRequest();
                }}
              >
                <p className="text-sm font-semibold text-fg">{t.requestNew}</p>
                <p className="text-xs text-fg-subtle">{t.requestHint}</p>
                <label className="text-xs font-medium text-fg-muted">
                  {t.requestLabelFr}
                  <input
                    value={askFr}
                    onChange={(e) => setAskFr(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg"
                  />
                </label>
                <label className="text-xs font-medium text-fg-muted">
                  {t.requestLabelEn}
                  <input
                    value={askEn}
                    onChange={(e) => setAskEn(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium text-fg-muted">
                    {t.requestWho}
                    <select
                      value={askWho}
                      onChange={(e) => setAskWho(e.target.value as "taxpayer" | "firm")}
                      className="mt-1 min-h-[44px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg"
                    >
                      <option value="taxpayer">{t.requestWhoClient}</option>
                      <option value="firm">{t.requestWhoFirm}</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium text-fg-muted">
                    {t.requestDue}
                    <input
                      type="date"
                      value={askDue}
                      onChange={(e) => setAskDue(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={busy === "new-request" || !allowed("request.create").ok}
                  className="inline-flex min-h-[44px] w-fit items-center rounded-lg bg-teal px-4 text-sm font-semibold text-surface disabled:opacity-50"
                >
                  {busy === "new-request" ? t.requestSaving : t.requestSave}
                </button>
                {failed === "new-request" && (
                  <p className="text-xs text-danger-text">{refusedBy ?? t.moveFailed}</p>
                )}
              </form>
              <p className="px-4 py-3 text-xs text-fg-subtle sm:px-5">{t.acceptHint}</p>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.tasksTitle} />
            <div className="flex flex-col divide-y divide-border">
              {tasks.length === 0 ? (
                <div className="p-4 sm:p-5">
                  <p className="text-sm text-fg-muted">{t.tasksEmpty}</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-subtle">{t.tasksHidden}</p>
                </div>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="flex items-start justify-between gap-3 p-4 sm:p-5">
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          task.state === "done" ? "text-fg-subtle line-through" : "text-fg"
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.detail && (
                        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                          {task.detail}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-fg-subtle">
                        {task.assigned_to ?? t.noOwner}
                        {task.due_on && ` · ${task.due_on}`}
                        {task.is_blocking && ` · ${t.blockingTask}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleTask(task)}
                      disabled={busy === task.id || !advanceVerdict.ok}
                      className={btnSecondary}
                    >
                      {task.state === "done" ? t.taskReopen : t.taskDone}
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t.gateTitle} />
            <div className="flex flex-col gap-2 p-4 sm:p-5">
              {findings.length === 0 && <p className="text-sm text-teal-text">{t.gateClean}</p>}
              {blocking.map((f) => (
                <p
                  key={f.code}
                  className="rounded-lg border border-danger-text/40 bg-danger-soft px-3 py-2 text-sm leading-snug text-danger-text"
                >
                  <span className="font-semibold">{t.blocking}</span> ·{" "}
                  {locale === "fr" ? f.fr : f.en}
                </p>
              ))}
              {advisory.map((f) => (
                <p
                  key={f.code}
                  className="rounded-lg border border-amber/50 bg-amber-soft px-3 py-2 text-sm leading-snug text-amber-text"
                >
                  <span className="font-semibold">{t.advisory}</span> ·{" "}
                  {locale === "fr" ? f.fr : f.en}
                </p>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.approvalTitle} />
            <dl className="flex flex-col gap-3 p-4 sm:p-5">
              <Field label={t.preparedBy}>{row.prepared_by ?? t.notYet}</Field>
              <Field label={t.approvedBy}>{row.approved_by ?? t.notYet}</Field>
              {row.self_approved && (
                <p className="rounded-lg border border-amber/50 bg-amber-soft px-3 py-2 text-xs text-amber-text">
                  {t.selfApproved}
                </p>
              )}
              {requiresSecondReview(members) && (
                <p className="text-xs leading-relaxed text-fg-subtle">{t.secondReviewRequired}</p>
              )}
              {approval && !approval.ok && (
                <p className="text-xs leading-relaxed text-fg-muted">
                  {approvalLabel(approval.reason, locale)}
                </p>
              )}
              {approval && !approval.ok && approval.reason === "self_approval_not_disclosed" && (
                <label className="flex items-start gap-2 text-xs text-fg">
                  <input
                    type="checkbox"
                    checked={disclose}
                    onChange={(e) => setDisclose(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  {t.discloseSelf}
                </label>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title={t.authority} />
            <dl className="flex flex-col gap-3 p-4 sm:p-5">
              {!authority && <p className="text-sm text-teal-text">{t.authorityOk}</p>}
              <Field label={t.scopeNote}>
                {engagement?.scope_note ?? <span className="text-fg-muted">{t.noScope}</span>}
              </Field>
              <Field label={t.fee}>
                {engagement?.fee_xaf == null ? (
                  "—"
                ) : (
                  <span className="tnum font-mono">
                    {engagement.fee_xaf.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} XAF
                  </span>
                )}
              </Field>
              <Field label={t.assignedTo}>{engagement?.assigned_to ?? t.noOwner}</Field>
            </dl>
          </Card>

          <Card>
            <CardHeader title={t.notesTitle} />
            <div className="flex flex-col gap-2 p-4 sm:p-5">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={t.notePlaceholder}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              />
              <label className="flex items-center gap-2 text-xs text-fg">
                <input
                  type="checkbox"
                  checked={noteClient}
                  onChange={(e) => setNoteClient(e.target.checked)}
                  disabled={!allowed("note.write_client").ok}
                  className="h-4 w-4"
                />
                {noteClient ? t.noteClient : t.noteInternal}
              </label>
              <button
                type="button"
                onClick={() => void saveNote()}
                disabled={!note.trim() || busy === "note"}
                className={btnPrimary}
              >
                {busy === "note" ? t.moving : t.noteSend}
              </button>
              {failed === "note" && <p className="text-xs text-danger-text">{t.noteEmpty}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t.activityTitle}
              action={
                <div className="flex gap-1">
                  {(["firm", "client"] as const).map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => setTab(x)}
                      className={`min-h-[32px] rounded-full px-2.5 py-1 text-xs font-medium ${
                        tab === x
                          ? "bg-navy text-surface"
                          : "border border-border text-fg-muted hover:bg-surface-sunken"
                      }`}
                    >
                      {x === "firm" ? t.tabFirm : t.tabClient}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="flex flex-col gap-3 p-4 sm:p-5">
              {tab === "firm" && !canSeeInternal && (
                <p className="text-xs leading-relaxed text-fg-subtle">{t.internalHidden}</p>
              )}
              {shown.length === 0 ? (
                <p className="text-sm text-fg-muted">{t.activityEmpty}</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {shown.map((e) => (
                    <li key={e.id} className="border-l-2 border-border pl-3">
                      <p className="text-sm leading-snug text-fg">{describe(e, locale)}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                        <span className="tnum font-mono">
                          {e.occurred_at.slice(0, 16).replace("T", " ")}
                        </span>
                        {e.actor_label && <span>· {e.actor_label}</span>}
                        <span
                          className={`rounded-full px-1.5 py-0.5 ${
                            e.visibility === "client"
                              ? "bg-teal-soft text-teal-text"
                              : "bg-surface-sunken text-fg-muted"
                          }`}
                        >
                          {e.visibility === "client" ? t.noteClient : t.noteInternal}
                        </span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
