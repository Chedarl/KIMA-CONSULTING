"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * The firm's logo when one is set, otherwise the KIMA mark. The logo lives in
 * the private kima-demo bucket; a short-lived signed URL is minted on mount.
 */
export function BrandMark({ size = 28, className = "h-7 w-7 shrink-0" }: { size?: number; className?: string }) {
  const [src, setSrc] = useState("/brand/mark-white.svg");
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase().from("branding").select("logo_path").eq("scope", "firm").maybeSingle();
      if (!alive || !data?.logo_path) return;
      const signed = await supabase().storage.from("kima-demo").createSignedUrl(data.logo_path, 86_400);
      if (alive && signed.data?.signedUrl) setSrc(signed.data.signedUrl);
    })();
    return () => { alive = false; };
  }, []);
  return <img src={src} alt="" width={size} height={size} className={className} />;
}
