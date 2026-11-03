"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { themeCss } from "@/lib/theme";

/**
 * Resolves the signed-in firm's branding (accent) and applies it as CSS
 * variables. When no branding row exists the KIMA default holds — the brand
 * is the fallback, the firm's accent is the override.
 */
export function ThemeRoot({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase().from("branding").select("accent").eq("scope", "firm").maybeSingle();
      if (!alive || !data?.accent) return;
      const id = "kima-firm-theme";
      let el = document.getElementById(id) as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement("style");
        el.id = id;
        document.head.appendChild(el);
      }
      el.textContent = ":root { " + themeCss(data.accent) + " }";
    })();
    return () => { alive = false; };
  }, []);
  return <>{children}</>;
}
