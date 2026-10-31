/**
 * Public onboarding — claims collected before a reviewer opens a file.
 *
 * A finished wizard writes one `registrations` row. That row is the
 * applicant's private application. It is not a taxpayer file, not an approved
 * portal account, and not a Postgres tenant. Anon can insert and cannot
 * select, so one applicant cannot read another applicant's row.
 *
 * Tax regime and tax centre are deliberately absent. Those axes decide which
 * obligations exist and when the DSF is due, and a visitor cannot answer them
 * reliably. `taxpayer_type` is only the coarse kind needed by the existing
 * registrations column: an accounting practice is stored as `business_moral`
 * (the firm is a company) plus `workspace_kind = accounting_firm`.
 */

import type { TaxpayerType } from "./rules";

export const WORKSPACE_KINDS = ["individual", "business", "accounting_firm"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const ONBOARDING_SERVICES = ["tax", "dsf", "accounting", "calendar", "expert"] as const;
export type OnboardingService = (typeof ONBOARDING_SERVICES)[number];

export const INTAKE_VALUES = ["online", "whatsapp", "agency", "referral"] as const;
export type PublicIntake = (typeof INTAKE_VALUES)[number];

export type OnboardingStep =
  | "type"
  | "account"
  | "company"
  | "contacts"
  | "services"
  | "verify"
  | "ready";

export const SIDEBAR_STEPS: OnboardingStep[] = [
  "account",
  "company",
  "contacts",
  "services",
  "verify",
  "ready",
];

export type OnboardingDraft = {
  kind: WorkspaceKind | "";
  firmId?: string;
  intake: PublicIntake;
  name: string;
  email: string;
  phone: string;
  legalName: string;
  niu: string;
  sector: string;
  city: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  services: OnboardingService[];
  language: "fr" | "en";
  note: string;
};

export const EMPTY_ONBOARDING: OnboardingDraft = {
  kind: "",
  firmId: "",
  intake: "online",
  name: "",
  email: "",
  phone: "",
  legalName: "",
  niu: "",
  sector: "",
  city: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  services: [],
  language: "fr",
  note: "",
};

export type OnboardingIssue =
  | "kind"
  | "name"
  | "contact"
  | "email"
  | "phone"
  | "legalName"
  | "niu"
  | "contactEmail"
  | "contactPhone"
  | "services"
  | "inviteEmail";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normaliseNiu = (raw: string): string =>
  raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export const emailLooksValid = (raw: string): boolean => EMAIL.test(raw.trim());

export const phoneLooksValid = (raw: string): boolean => {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
};

export function isWorkspaceKind(value: string | undefined): value is WorkspaceKind {
  return WORKSPACE_KINDS.includes(value as WorkspaceKind);
}

/**
 * Kinds a visitor may pick today. `accounting_firm` stays a valid stored value
 * but is not offered: `member_has()` has no organisation scope yet, so a second
 * firm's members would see every taxpayer (backlog P2-5). Owner decision,
 * 27 Oct 2026 — reopen it when organisation scoping lands.
 */
export const OPEN_WORKSPACE_KINDS = ["individual", "business"] as const satisfies readonly WorkspaceKind[];
export type OpenWorkspaceKind = (typeof OPEN_WORKSPACE_KINDS)[number];

export function isOpenWorkspaceKind(value: string | undefined): value is OpenWorkspaceKind {
  return OPEN_WORKSPACE_KINDS.includes(value as OpenWorkspaceKind);
}

/** Coarse type the existing registrations column already understands. */
export function taxpayerTypeFor(kind: WorkspaceKind): TaxpayerType {
  return kind === "individual" ? "individual_pit" : "business_moral";
}

export function needsLegalName(kind: WorkspaceKind | ""): boolean {
  return kind === "business" || kind === "accounting_firm";
}

export function displayName(draft: Pick<OnboardingDraft, "kind" | "name" | "legalName">): string {
  if (needsLegalName(draft.kind) && draft.legalName.trim()) return draft.legalName.trim();
  return draft.name.trim();
}

/** Firm choice is optional (owner decision, 31 Oct 2026) and never gates submit. */
export function issuesFor(step: OnboardingStep, draft: OnboardingDraft): OnboardingIssue[] {
  if (step === "type") return draft.kind ? [] : ["kind"];
  if (step === "account") return accountIssues(draft);
  if (step === "company") return companyIssues(draft);
  if (step === "contacts") return contactIssues(draft);
  if (step === "services") return draft.services.length > 0 ? [] : ["services"];
  if (step === "verify" || step === "ready") {
    return [
      ...issuesFor("type", draft),
      ...issuesFor("account", draft),
      ...issuesFor("company", draft),
      ...issuesFor("contacts", draft),
      ...issuesFor("services", draft),
    ];
  }
  return [];
}

function accountIssues(draft: OnboardingDraft): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];
  if (draft.name.trim().length < 2) issues.push("name");
  const email = draft.email.trim();
  const phone = draft.phone.trim();
  if (email && !emailLooksValid(email)) issues.push("email");
  if (phone && !phoneLooksValid(phone)) issues.push("phone");
  if (!email && !phone) issues.push("contact");
  else if (email && !emailLooksValid(email) && !phoneLooksValid(phone)) issues.push("contact");
  return issues;
}

function companyIssues(draft: OnboardingDraft): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];
  if (needsLegalName(draft.kind) && draft.legalName.trim().length < 2) issues.push("legalName");
  const niu = normaliseNiu(draft.niu);
  if (draft.niu.trim() && niu.length < 5) issues.push("niu");
  return issues;
}

function contactIssues(draft: OnboardingDraft): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];
  const email = draft.contactEmail.trim();
  const phone = draft.contactPhone.trim();
  if (email && !emailLooksValid(email)) issues.push("contactEmail");
  if (phone && !phoneLooksValid(phone)) issues.push("contactPhone");
  return issues;
}

/** A short inquiry from the public contact section. Services are not required. */
export function contactLeadIssues(draft: OnboardingDraft): OnboardingIssue[] {
  return [...issuesFor("type", draft), ...accountIssues(draft)];
}

export type RegistrationInsert = {
  /** Columns that exist before the onboarding migration. */
  base: Record<string, unknown>;
  /** Base plus the nullable workspace claims. Dropped if the column is absent. */
  full: Record<string, unknown>;
};

/**
 * The row the public form inserts. `full` carries the isolation hook
 * (`workspace_ref` + `onboarding`). Nothing here is a verified fact.
 */
export function registrationInsert(draft: OnboardingDraft, workspaceRef: string): RegistrationInsert {
  if (!draft.kind) throw new Error("workspace kind is required");
  const legal = needsLegalName(draft.kind) ? draft.legalName.trim() || null : null;
  const base: Record<string, unknown> = {
    ...(draft.firmId ? { organization_id: draft.firmId } : {}),
    applicant_name: draft.name.trim(),
    applicant_email: draft.email.trim() || null,
    applicant_phone: draft.phone.trim() || null,
    taxpayer_type: taxpayerTypeFor(draft.kind),
    legal_name: legal,
    declared_niu: draft.niu.trim() ? normaliseNiu(draft.niu) : null,
    intake_channel: draft.intake,
    preferred_language: draft.language,
  };
  const onboarding = {
    city: draft.city.trim() || null,
    business_sector: draft.sector.trim() || null,
    services: draft.services,
    secondary_contact: {
      name: draft.contactName.trim() || null,
      email: draft.contactEmail.trim() || null,
      phone: draft.contactPhone.trim() || null,
    },
    note: draft.note.trim() || null,
    /**
     * What isolation means for this row: a private application, unreadable by
     * other anonymous clients. Not a membership-scoped taxpayer tenant.
     */
    isolation: "private_application",
  };
  return {
    base,
    full: {
      ...base,
      workspace_kind: draft.kind,
      workspace_ref: workspaceRef,
      onboarding,
    },
  };
}

export function inviteEmailIssue(email: string): OnboardingIssue | null {
  return emailLooksValid(email) ? null : "inviteEmail";
}
