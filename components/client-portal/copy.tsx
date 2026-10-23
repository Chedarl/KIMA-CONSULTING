"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PortalCopy } from "@/lib/i18n-portal";

const PortalCopyContext = createContext<PortalCopy | null>(null);

/** One language, chosen on the server. Client pages read it from here. */
export function PortalCopyProvider({ copy, children }: { copy: PortalCopy; children: ReactNode }) {
  return <PortalCopyContext.Provider value={copy}>{children}</PortalCopyContext.Provider>;
}

export function usePortalCopy(): PortalCopy {
  const copy = useContext(PortalCopyContext);
  if (!copy) {
    throw new Error("Portal copy is missing. Render this screen inside the client layout.");
  }
  return copy;
}
