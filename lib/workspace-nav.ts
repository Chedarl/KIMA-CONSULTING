import type { IconName } from "@/components/shell";

/**
 * The firm workspace information architecture, in one place.
 *
 * The 4 Nov update document specifies seven destinations: Accueil, Tâches,
 * Coffre, Messages, Clients, Calendrier, Réglages. The rail carried nine. Every
 * other screen stays reachable as a tab, no URL changes, and the tab strip is
 * what makes collapsing the rail safe.
 *
 * `tabKey` indexes the firm nav dictionary, so FR/EN parity is already covered.
 */
export type WorkspaceTab = {
  /** Path after `/{locale}/workspace`. */
  path: string;
  /** A key of the firm nav dictionary. */
  tabKey: string;
  /** Rendered but not navigable while its engine is closed. */
  ready?: boolean;
};

export type WorkspaceSection = {
  key: string;
  path: string;
  icon: IconName;
  fr: string;
  en: string;
  tabs: WorkspaceTab[];
};

export const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  {
    key: "dashboard",
    path: "",
    icon: "grid",
    fr: "Tableau de bord",
    en: "Dashboard",
    tabs: [],
  },
  {
    key: "work",
    path: "/workflows",
    icon: "queue",
    fr: "Tâches",
    en: "Tasks",
    tabs: [
      { path: "/workflows", tabKey: "workflows" },
      { path: "/reviews", tabKey: "reviews" },
      { path: "/cases", tabKey: "cases" },
      { path: "/filing", tabKey: "filing" },
    ],
  },
  {
    key: "documents",
    path: "/vault",
    icon: "archive",
    fr: "Coffre",
    en: "Vault",
    tabs: [
      { path: "/vault", tabKey: "vault" },
      { path: "/inbox", tabKey: "inbox" },
    ],
  },
  {
    key: "messages",
    path: "/messages",
    icon: "chat",
    fr: "Messages",
    en: "Messages",
    tabs: [{ path: "/ai", tabKey: "ai" }],
  },
  {
    key: "clients",
    path: "/clients",
    icon: "people",
    fr: "Clients",
    en: "Clients",
    tabs: [
      { path: "/clients", tabKey: "clients" },
      { path: "/crm", tabKey: "crm" },
      { path: "/leads", tabKey: "leads" },
      { path: "/routing", tabKey: "routing" },
      { path: "/engagements", tabKey: "engagements" },
      { path: "/templates", tabKey: "templates" },
      { path: "/billing", tabKey: "billing" },
      { path: "/time", tabKey: "time" },
    ],
  },
  {
    key: "compliance",
    path: "/calendar",
    icon: "calendar",
    fr: "Calendrier",
    en: "Calendar",
    tabs: [
      { path: "/calendar", tabKey: "calendar" },
      { path: "/dsf", tabKey: "dsf" },
    ],
  },
  {
    key: "firm",
    path: "/settings",
    icon: "cog",
    fr: "Réglages",
    en: "Settings",
    tabs: [
      { path: "/settings", tabKey: "admin" },
      { path: "/staff", tabKey: "staff" },
      { path: "/invitations", tabKey: "invitations" },
      { path: "/branding", tabKey: "branding" },
      { path: "/incidents", tabKey: "incidents" },
      { path: "/kyc", tabKey: "kyc" },
      { path: "/reports", tabKey: "reports", ready: false },
    ],
  },
];

/** The section a path belongs to; longest match wins. */
export function sectionForPath(pathAfterWorkspace: string): WorkspaceSection | undefined {
  const p = pathAfterWorkspace.replace(/\/+$/, "");
  let best: WorkspaceSection | undefined;
  for (const section of WORKSPACE_SECTIONS) {
    const candidates = [section.path, ...section.tabs.map((t) => t.path)];
    for (const c of candidates) {
      if (c === "" ? p === "" : p === c || p.startsWith(c + "/")) {
        if (!best || c.length > (best.path.length || 0)) best = section;
      }
    }
  }
  return best ?? WORKSPACE_SECTIONS.find((s) => s.path === "");
}
