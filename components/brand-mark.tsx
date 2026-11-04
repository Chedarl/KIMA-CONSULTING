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
  // A raw <img>, not next/image, and the rule is disabled rather than worked
  // around: `src` is a short-lived signed URL for a private bucket object, so
  // the optimizer would have to be given the Supabase host in
  // `images.remotePatterns` and would then cache a URL that expires in 24h.
  // The mark renders at 28px, so there is no LCP or bandwidth argument to
  // answer. Same treatment, and the same reason, as marketing/wordmark.tsx.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className={className} />;
}
