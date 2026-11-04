"use client";

import { useEffect, useState } from "react";

/**
 * One refresh signal for the whole workspace.
 *
 * Every screen used to load once and then sit still, so an accountant who
 * accepted a document on one tab saw the old count on every other. The screens
 * now share a single event: whoever writes emits it, and whoever is listening
 * refetches. Realtime and a return to the tab both go through the same path.
 */
export const REFRESH_EVENT = "kima:refresh";

export function emitRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/**
 * Returns a counter that changes whenever the app should refetch. Put it in the
 * dependency array of the screen's loader and the loader runs again.
 */
export function useRefreshTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      // A burst of realtime rows is one refresh, not ten.
      timer = setTimeout(() => {
        timer = null;
        setTick((v) => v + 1);
      }, 250);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    window.addEventListener(REFRESH_EVENT, fire);
    window.addEventListener("focus", fire);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(REFRESH_EVENT, fire);
      window.removeEventListener("focus", fire);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return tick;
}
