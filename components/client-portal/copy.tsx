"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { withAudienceVoice, type PortalCopy } from "@/lib/i18n-portal";
import { readSession, type PortalAudience } from "@/lib/portal-auth";

const PortalCopyContext = createContext<{ copy: PortalCopy; locale: "fr" | "en" } | null>(null);

/** One language, chosen on the server. Client pages read it from here. */
export function PortalCopyProvider({
  copy,
  locale,
  children,
}: {
  copy: PortalCopy;
  locale: "fr" | "en";
  children: ReactNode;
}) {
  return (
    <PortalCopyContext.Provider value={{ copy, locale }}>{children}</PortalCopyContext.Provider>
  );
}

/**
 * The audience of the signed-in taxpayer, or null until it is known.
 *
 * The session lives in sessionStorage, which does not exist while the server
 * renders, so it is read after mount rather than during render -- reading it
 * in render would hydrate one wording over another and mismatch.
 */
function useAudience(): PortalAudience | null {
  const [audience, setAudience] = useState<PortalAudience | null>(null);
  useEffect(() => {
    setAudience(readSession()?.audience ?? null);
  }, []);
  return audience;
}

/**
 * Portal copy in the voice of whoever is signed in.
 *
 * Every portal screen reads its words through here, so applying the audience
 * at this one point is what makes a salarié stop being addressed as a company
 * across the whole portal rather than on the one screen someone remembered.
 */
export function usePortalCopy(): PortalCopy {
  const value = useContext(PortalCopyContext);
  if (!value) {
    throw new Error("Portal copy is missing. Render this screen inside the client layout.");
  }
  const audience = useAudience();
  return useMemo(
    () => withAudienceVoice(value.copy, value.locale, audience),
    [value.copy, value.locale, audience],
  );
}
