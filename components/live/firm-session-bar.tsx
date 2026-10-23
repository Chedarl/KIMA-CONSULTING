"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  clearFirmSession,
  memberFromSession,
  subscribeFirmSession,
  type FirmSession,
} from "@/lib/firm-auth";
import { capabilitiesOf } from "@/lib/permissions";

type Labels = {
  title: string;
  role: string;
  signOut: string;
  signedOut: string;
  capabilities: string;
};

/**
 * Who is signed in, and what that role may do.
 *
 * The list is `capabilitiesOf()` over the OTP session — the same matrix as
 * `role_capabilities`. It is not a second permission system.
 */
export function FirmSessionBar({ locale, t }: { locale: "fr" | "en"; t: Labels }) {
  const [session, setSession] = useState<FirmSession | null | undefined>(undefined);

  useEffect(() => subscribeFirmSession(setSession), []);

  const caps = useMemo(() => {
    if (!session) return [];
    return capabilitiesOf({ kind: "firm", member: memberFromSession(session) });
  }, [session]);

  if (session === undefined) {
    return <div className="h-11" aria-hidden />;
  }

  if (!session) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber/50 bg-amber-soft px-4 py-3">
        <p className="text-sm text-amber-text">{t.signedOut}</p>
        <Link
          href={`/${locale}/firm-login`}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-text px-4 text-sm font-semibold text-surface hover:opacity-90"
        >
          {t.title}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-w-[16rem] flex-col gap-2 rounded-card border border-border bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{session.personLabel}</p>
          <p className="truncate text-xs text-fg-muted">
            {t.role}: {session.role}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void clearFirmSession()}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-surface-sunken"
        >
          {t.signOut}
        </button>
      </div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{t.capabilities}</p>
      <ul className="flex flex-wrap gap-1">
        {caps.map((cap) => (
          <li
            key={cap}
            className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 font-mono text-[11px] text-fg-muted"
          >
            {cap}
          </li>
        ))}
      </ul>
    </div>
  );
}
