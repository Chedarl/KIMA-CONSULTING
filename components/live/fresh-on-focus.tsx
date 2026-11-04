"use client";

import { useEffect, useState, type ReactNode } from "react";
import { emitRefresh } from "@/lib/refresh";

/**
 * Returning to the tab must not show yesterday's numbers.
 *
 * The page tree is remounted when the window has been hidden for a while, which
 * re-runs every loader below it — the same effect as a refresh, without a
 * browser reload and without losing the route. Short hops (a click away and
 * back) only emit the shared refresh event, so nothing flickers.
 */
export function FreshOnFocus({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > 30_000) {
        hiddenAt = 0;
        setGeneration((g) => g + 1);
      }
      emitRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return <div key={generation}>{children}</div>;
}
