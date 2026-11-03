"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export type RealtimeTable =
  | "compliance_cases"
  | "document_requests"
  | "documents"
  | "case_tasks"
  | "case_events"
  | "invoices"
  | "service_payments"
  | "messages"
  | "notification_outbox";

export type RealtimeEvent = { table: RealtimeTable; event: "INSERT" | "UPDATE" | "DELETE" };

// One channel per screen, the tables it cares about listed once. A burst of
// changes collapses into a single callback after debounceMs, so a batch edit
// causes one refetch instead of one per row. RLS still applies to every
// postgres_changes payload, because the channel carries the caller JWT.
export function useRealtime(
  channelName: string,
  tables: RealtimeTable[],
  onChange: (event: RealtimeEvent) => void,
  debounceMs = 180,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const db = supabase();
    const channel = db.channel(channelName);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            onChangeRef.current({ table, event: payload.eventType as RealtimeEvent["event"] });
          }, debounceMs);
        },
      );
    }
    channel.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void db.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, tables.join(","), debounceMs]);
}
