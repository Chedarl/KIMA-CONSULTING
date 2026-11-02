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
    let live = true;
    void supabase().rpc("list_unassigned_registrations").then(({ error }) => {
      if (!live) return;
      setVisible(!error);
    });
    return () => { live = false; };
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
