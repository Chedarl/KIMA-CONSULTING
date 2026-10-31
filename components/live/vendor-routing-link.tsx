"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * The routing queue is a vendor-admin tool. The rail item appears only after
 * list_unassigned_registrations() succeeds. A 42501, or any other failure,
 * leaves the item out — the refusal is not a hint that rows exist.
 */
export function VendorRoutingLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname() || "";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    let epoch = 0;
    let identity: string | null | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const db = supabase();

    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const nextUserId = event === "SIGNED_OUT" ? null : session?.user?.id ?? null;
      if (nextUserId === identity) return; // Same-user refresh keeps the link.
      identity = nextUserId;
      const request = ++epoch;
      if (timer) clearTimeout(timer);
      // A previous administrator's link must disappear on sign-out or switch.
      setVisible(false);
      if (!nextUserId) return;
      timer = setTimeout(() => {
        void (async () => {
          try {
            const { error } = await db.rpc("list_unassigned_registrations");
            if (!active || request !== epoch) return;
            setVisible(!error);
          } catch {
            if (!active || request !== epoch) return;
            setVisible(false);
          }
        })();
      }, 0);
    });

    return () => {
      active = false;
      ++epoch;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  if (!visible) return null;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`rail-item flex min-h-[44px] items-center gap-2.5 px-3 text-sm focus-visible:outline-white ${
          active ? "bg-rail-fg font-semibold text-rail" : "text-rail-muted hover:bg-white/10 hover:text-rail-fg"
        }`}
      >
        <span className="break-words">{label}</span>
      </Link>
    </li>
  );
}
