import type { IconName } from "@/components/shell";

/**
 * The firm workspace information architecture, in one place.
 *
 * The rail had grown to 21 destinations across 7 headings against a specified
 * IA of 10. This is the nine the 4 Nov UI/UX audit asked for: every existing
 * screen kept, every screen still reachable, and no URL changed -- a section's
 * `tabs` are routes that already exist. The tab strip is what replaces a rail
 * entry, which is the only reason collapsing the rail is safe.
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
    key: "clients",
    path: "/clients",
    icon: "people",
    fr: "Clients",
    en: "Clients",
    tabs: [
      { path: "/clients", tabKey: "clients" },
      { path: "/leads", tabKey: "leads" },
      { path: "/routing", tabKey: "routing" },
      { path: "/engagements", tabKey: "engagements" },
      { path: "/templates", tabKey: "templates" },
    ],
  },
  {
    key: "work",
    path: "/workflows",
    icon: "queue",
    fr: "Missions",
    en: "Work",
    tabs: [
      { path: "/workflows", tabKey: "workflows" },
      { path: "/reviews", tabKey: "reviews" },
    ],
  },
  {
    key: "documents",
    path: "/inbox",
    icon: "inbox",
    fr: "Documents",
    en: "Documents",
    tabs: [
      { path: "/inbox", tabKey: "inbox" },
      { path: "/vault", tabKey: "vault" },
    ],
  },
  {
    key: "compliance",
    path: "/calendar",
    icon: "calendar",
    fr: "Conformité",
    en: "Compliance",
    tabs: [
      { path: "/calendar", tabKey: "calendar" },
      { path: "/dsf", tabKey: "dsf" },
      { path: "/cases", tabKey: "cases" },
      { path: "/filing", tabKey: "filing" },
    ],
  },
  {
    key: "messages",
    path: "/messages",
    icon: "chat",
    fr: "Messages",
    en: "Messages",
    tabs: [],
  },
  {
    key: "finance",
    path: "/billing",
    icon: "card",
    fr: "Finances",
    en: "Finance",
    tabs: [
      { path: "/billing", tabKey: "billing" },
      { path: "/time", tabKey: "time" },
      { path: "/reports", tabKey: "reports", ready: false },
    ],
  },
  {
    key: "firm",
    path: "/settings",
    icon: "cog",
    fr: "Cabinet",
    en: "Firm",
    tabs: [
      { path: "/settings", tabKey: "admin" },
      { path: "/staff", tabKey: "staff" },
      { path: "/invitations", tabKey: "invitations" },
      { path: "/branding", tabKey: "branding" },
      { path: "/incidents", tabKey: "incidents" },
      { path: "/kyc", tabKey: "kyc" },
    ],
  },
  {
    key: "ai",
    path: "/ai",
    icon: "chat",
    fr: "Kima AI",
    en: "Kima AI",
    tabs: [],
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
