"use client";
// Staff reads rely on firm RLS; all mutations use the audited staff RPC.
import { useCallback, useEffect, useState } from "react";
import {
  ASSIGNABLE_STAFF_ROLES,
  inviteStaff,
  isAssignableStaffRole,
  revokeStaff,
  setStaffRole,
  type AssignableStaffRole,
  type StaffMember,
  type StaffRefusal,
} from "@/lib/firm-staff";
import { subscribeFirmSession, type FirmSession } from "@/lib/firm-auth";
import type { FirmRole } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { Card, CardHeader } from "@/components/ui";
export type StaffLabels = {
  subtitle: string;
  signIn: string;
  notPartner: string;
  empty: string;
  colPerson: string;
  colRole: string;
  colState: string;
  colActions: string;
  roleFirmStaff: string;
  roleFirmReviewer: string;
  roleFirmPartner: string;
  roleKimaAdmin: string;
  stateActive: string;
  stateRevoked: string;
  you: string;
  invite: string;
  inviteTitle: string;
  inviteName: string;
  inviteNamePh: string;
  inviteEmail: string;
  inviteEmailPh: string;
  inviteRole: string;
  inviteSubmit: string;
  cancel: string;
  noEmailSent: string;
  partnerNotAssignable: string;
  changeRole: string;
  revoke: string;
  revokeConfirm: string;
  invited: string;
  roleChanged: string;
  revoked: string;
  refusals: Record<StaffRefusal, string>;
  loadFailed: string;
  retry: string;
};
const BTN_PRIMARY =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-navy";
const BTN_QUIET =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-fg hover:bg-surface-sunken disabled:opacity-50 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-navy";
const FIELD =
  "min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-fg focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-navy";
export function StaffWorkspace({ labels }: { labels: StaffLabels }) {
  const toast = useToast();
  const [session, setSession] = useState<FirmSession | null>(null);
  const [rows, setRows] = useState<StaffMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableStaffRole>("firm_staff");
  useEffect(() => subscribeFirmSession(setSession), []);
  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase()
      .from("firm_members")
      .select("id, person_label, role, active, deactivated_at")
      .order("person_label");
    if (error) {
      setFailed(true);
      return;
    }
    setRows((data ?? []) as StaffMember[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const isPartner = session?.role === "firm_partner";
  function roleLabel(value: FirmRole): string {
    if (value === "firm_staff") return labels.roleFirmStaff;
    if (value === "firm_reviewer") return labels.roleFirmReviewer;
    if (value === "firm_partner") return labels.roleFirmPartner;
    return labels.roleKimaAdmin;
  }
  function fill(template: string, who: string): string {
    return template.replace("{name}", who);
  }
  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!isPartner) {
      toast(labels.signIn, "error");
      return;
    }
    setBusy("invite");
    const result = await inviteStaff(email.trim(), name.trim(), role);
    setBusy(null);
    if (!result.ok) {
      toast(labels.refusals[result.refusal], "error");
      return;
    }
    toast(fill(labels.invited, name.trim()));
    setName("");
    setEmail("");
    setRole("firm_staff");
    setInviting(false);
    await load();
  }
  async function changeRole(row: StaffMember, next: string) {
    if (!isAssignableStaffRole(next)) {
      toast(labels.refusals.role_not_assignable, "error");
      return;
    }
    setBusy(row.id);
    const result = await setStaffRole(row.id, next);
    setBusy(null);
    if (!result.ok) {
      toast(labels.refusals[result.refusal], "error");
      return;
    }
    toast(fill(labels.roleChanged, row.person_label));
    await load();
  }
  async function revoke(row: StaffMember) {
    if (!window.confirm(fill(labels.revokeConfirm, row.person_label))) return;
    setBusy(row.id);
    const result = await revokeStaff(row.id);
    setBusy(null);
    if (!result.ok) {
      toast(labels.refusals[result.refusal], "error");
      return;
    }
    toast(fill(labels.revoked, row.person_label));
    await load();
  }
  if (!session) {
    return (
      <Card className="p-4">
        <p className="text-sm text-fg-muted">{labels.signIn}</p>
      </Card>
    );
  }
  if (failed) {
    return (
      <Card className="p-4">
        <p className="text-sm text-fg-muted">{labels.loadFailed}</p>
        <button type="button" onClick={() => void load()} className={`${BTN_QUIET} mt-3`}>
          {labels.retry}
        </button>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {!isPartner && (
        <Card className="p-4">
          <p className="text-sm text-fg-muted">{labels.notPartner}</p>
        </Card>
      )}
      {isPartner && (
        <Card className="p-4">
          {!inviting ? (
            <button type="button" onClick={() => setInviting(true)} className={BTN_PRIMARY}>
              {labels.invite}
            </button>
          ) : (
            <form onSubmit={(e) => void submitInvite(e)} className="flex flex-col gap-3">
              <h2 className="font-display text-sm font-semibold text-fg">{labels.inviteTitle}</h2>
              <label className="flex flex-col gap-1 text-sm text-fg">
                {labels.inviteName}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={labels.inviteNamePh}
                  className={FIELD}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-fg">
                {labels.inviteEmail}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={labels.inviteEmailPh}
                  className={FIELD}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-fg">
                {labels.inviteRole}
                <select
                  value={role}
                  onChange={(e) =>
                    setRole(isAssignableStaffRole(e.target.value) ? e.target.value : "firm_staff")
                  }
                  className={FIELD}
                >
                  {ASSIGNABLE_STAFF_ROLES.map((value) => (
                    <option key={value} value={value}>
                      {roleLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              {/* Both of these are facts about the mechanism, not reassurance. */}
              <p className="text-xs text-fg-subtle">{labels.partnerNotAssignable}</p>
              <p className="text-xs text-fg-subtle">{labels.noEmailSent}</p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy === "invite"} className={BTN_PRIMARY}>
                  {labels.inviteSubmit}
                </button>
                <button type="button" onClick={() => setInviting(false)} className={BTN_QUIET}>
                  {labels.cancel}
                </button>
              </div>
            </form>
          )}
        </Card>
      )}
      <Card>
        <CardHeader title={labels.colPerson} />
        {rows && rows.length === 0 ? (
          <p className="p-4 text-sm text-fg-muted">{labels.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {(rows ?? []).map((row) => {
              const assignable = isAssignableStaffRole(row.role) && row.active;
              return (
                <li key={row.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">
                      {row.person_label}
                      {row.id === session.memberId && (
                        <span className="ml-2 text-xs font-normal text-fg-subtle">({labels.you})</span>
                      )}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {roleLabel(row.role)}
                      {" · "}
                      {row.active ? labels.stateActive : labels.stateRevoked}
                    </p>
                  </div>
                  {isPartner && assignable && row.id !== session.memberId && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-fg-muted">
                        <span className="sr-only sm:not-sr-only">{labels.changeRole}</span>
                        <select
                          value={row.role}
                          disabled={busy === row.id}
                          onChange={(e) => void changeRole(row, e.target.value)}
                          className={FIELD}
                        >
                          {ASSIGNABLE_STAFF_ROLES.map((value) => (
                            <option key={value} value={value}>
                              {roleLabel(value)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void revoke(row)}
                        className={BTN_QUIET}
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
      </Card>
    </div>
  );
}
