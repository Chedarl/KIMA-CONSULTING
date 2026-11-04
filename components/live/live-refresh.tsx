"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { emitRefresh } from "@/lib/refresh";

/**
 * The tables whose changes another screen is showing.
 *
 * One subscription for the whole workspace, rather than one per page: any
 * insert, update or delete emits the shared refresh event, and every listening
 * screen refetches. Screens that already subscribe to a single table for their
 * own animation keep doing so.
 */
const TABLES = [
  "compliance_cases",
  "documents",
  "document_requests",
  "invoices",
  "engagements",
  "time_entries",
  "messages",
  "taxpayers",
] as const;

export function LiveRefresh() {
  useEffect(() => {
    const db = supabase();
    const channel = db.channel("workspace-live");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => emitRefresh());
    }
    channel.subscribe();
    // The same floor for every other screen: nothing stays stale for long.
    const poll = setInterval(() => emitRefresh(), 15000);
    return () => {
      clearInterval(poll);
      void db.removeChannel(channel);
    };
  }, []);
  return null;
}
