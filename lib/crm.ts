/**
 * The client layer — TaxDome's account/contact split, corrected for this domain.
 *
 * WHY SEPARATE PEOPLE FROM FILES. In the reference product this is mostly a
 * convenience: a company has staff you email. Here it is load-bearing, because
 * the SARL owner who also files their own IRPP is one person with two tax
 * files. Collapsed into accounts, that person becomes two unrelated records and
 * the firm loses the fact that chasing one of them is chasing the same human.
 * It is also the only bridge between the business track and the individual
 * track — and the individual track is a reinstated legal obligation, not a
 * nice-to-have.
 *
 * SEGMENTS ARE DERIVED, TAGS ARE TYPED. The reference segments clients with
 * free tags, including tags for things like the regime. We refuse that: a
 * typed "IGS" tag would be a second, unverified copy of a classification a
 * reviewer owns, and the two would drift the moment a reviewer corrected one of
 * them. So:
 *
 *   - a **segment** is computed here from the profile, and carries whether the
 *     field behind it has been verified;
 *   - a **tag** is whatever the firm decides, and means nothing to the engine.
 *
 * That distinction is the whole reason this file exists rather than a tags
 * table doing both jobs.
 *
 * Pure functions over plain records, so a segment can be explained without
 * running the application.
 */

import {
  obligationsFor,
  reconcileRegimeAndCentre,
  regime as regimeDef,
  taxCentre as centreDef,
  taxpayerType as typeDef,
  type Cadence,
  type Regime,
  type TaxCentre,
  type TaxpayerType,
} from "./rules";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type Contact = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

export type Relationship =
  | "owner"
  | "director"
  | "employee"
  | "accountant"
  | "self"
  | "contact";

export type ContactLink = {
  id: string;
  contact_id: string;
  taxpayer_id: string;
  relationship: Relationship;
  /** Per link. Access to one file never implies access to another. */
  portal_access: boolean;
  notifications: boolean;
  is_primary: boolean;
};

export type AccountProfile = {
  id: string;
  legal_name: string;
  taxpayer_type: TaxpayerType | null;
  tax_regime: Regime | null;
  tax_centre: TaxCentre | null;
  accounting_framework: "normal" | "smt" | null;
  profile_verified: boolean;
};

export type Tone = "navy" | "success" | "amber" | "danger" | "neutral";

export type Tag = {
  id: string;
  label: string;
  tone: Tone;
};

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export type SegmentKind = "type" | "regime" | "centre" | "cadence" | "attention";

export type Segment = {
  kind: SegmentKind;
  code: string;
  fr: string;
  en: string;
  tone: Tone;
  /**
   * Has the profile field behind this been confirmed by a reviewer?
   *
   * The interface must visibly distinguish confirmed information from what a
   * client reported, so this travels with the segment rather than being
   * recomputed at each call site and forgotten in one of them.
   */
  verified: boolean;
};

export const segmentLabel = (s: Segment, locale: "fr" | "en") =>
  locale === "fr" ? s.fr : s.en;

/**
 * The segments for one account.
 *
 * Nothing here is stored, and nothing is inferred beyond what the profile
 * already states — turnover is never consulted, because an obligation may not
 * be derived from it.
 */
export function deriveSegments(a: AccountProfile): Segment[] {
  const out: Segment[] = [];
  const verified = a.profile_verified;

  if (a.taxpayer_type) {
    const t = typeDef(a.taxpayer_type);
    if (t) {
      out.push({
        kind: "type",
        code: a.taxpayer_type,
        fr: t.fr,
        en: t.en,
        tone: t.family === "individual" ? "neutral" : "navy",
        // Taxpayer type is the one classification a client can answer
        // reliably, so it does not wait on a reviewer the way the regime does.
        verified: true,
      });
    }
  }

  if (a.tax_regime) {
    const r = regimeDef(a.tax_regime);
    if (r) {
      const abolished = Boolean(r.supersededBy);
      out.push({
        kind: "regime",
        code: a.tax_regime,
        fr: r.fr,
        en: r.en,
        tone: abolished ? "danger" : verified ? "success" : "amber",
        verified: verified && !abolished,
      });
      if (abolished) {
        out.push({
          kind: "attention",
          code: "REGIME_ABOLISHED",
          fr: "Régime supprimé — à reclasser",
          en: "Abolished regime — reclassify",
          tone: "danger",
          verified: false,
        });
      }
    }
  }

  if (a.tax_centre && centreDef(a.tax_centre)) {
    out.push({
      kind: "centre",
      code: a.tax_centre,
      fr: a.tax_centre,
      en: a.tax_centre,
      tone: verified ? "navy" : "amber",
      verified,
    });
  }

  // Cadence is the most useful thing to sort a portfolio by, because it is what
  // the month actually looks like. Derived from the obligations, so it cannot
  // disagree with them.
  //
  // Only the REGIME-DRIVEN obligations count. Payroll IRPP is monthly and
  // applies to any business, so including it labelled every IGS client
  // "monthly" when the IGS itself is quarterly. Worse, it assumed a fact the
  // profile does not record: whether the client has employees at all. The
  // regime is something we know; headcount is not.
  if (a.taxpayer_type) {
    const applicable = obligationsFor({ type: a.taxpayer_type, regime: a.tax_regime });
    const regimeDriven = applicable.filter((o) => o.regimes.length > 0);
    // Individuals have no regime-driven obligations, so fall back to all of
    // theirs rather than reporting no cadence at all.
    const source = regimeDriven.length > 0 ? regimeDriven : applicable;
    const cadences = new Set<Cadence>(source.map((o) => o.cadence));
    const finest: Cadence | null = cadences.has("monthly")
      ? "monthly"
      : cadences.has("quarterly")
        ? "quarterly"
        : cadences.has("annual")
          ? "annual"
          : null;
    if (finest) {
      const text: Record<Cadence, { fr: string; en: string }> = {
        monthly: { fr: "Mensuel", en: "Monthly" },
        quarterly: { fr: "Trimestriel", en: "Quarterly" },
        annual: { fr: "Annuel", en: "Annual" },
      };
      out.push({
        kind: "cadence",
        code: finest,
        fr: text[finest].fr,
        en: text[finest].en,
        tone: "neutral",
        verified,
      });
    }
  }

  // Attention segments: what a practitioner wants to see without opening the
  // file. Each is a question, never a correction applied silently.
  if (!verified) {
    out.push({
      kind: "attention",
      code: "PROFILE_UNVERIFIED",
      fr: "Profil non vérifié",
      en: "Profile unverified",
      tone: "amber",
      verified: false,
    });
  }

  if (reconcileRegimeAndCentre(a.tax_regime, a.tax_centre)) {
    out.push({
      kind: "attention",
      code: "REGIME_CENTRE_MISMATCH",
      fr: "Régime et centre à confirmer",
      en: "Regime and centre to confirm",
      tone: "amber",
      verified: false,
    });
  }

  if (a.tax_regime && !a.accounting_framework) {
    out.push({
      kind: "attention",
      code: "FRAMEWORK_MISSING",
      fr: "Référentiel comptable absent",
      en: "Accounting framework missing",
      tone: "amber",
      verified: false,
    });
  }

  return out;
}

/** Only the segments that need somebody to do something. */
export const attentionSegments = (segments: Segment[]) =>
  segments.filter((s) => s.kind === "attention");

/** Does this account match a chosen segment code? Powers portfolio filtering. */
export const matchesSegment = (a: AccountProfile, code: string) =>
  deriveSegments(a).some((s) => s.code === code);

// ---------------------------------------------------------------------------
// Contacts across files
// ---------------------------------------------------------------------------

/**
 * The other files this contact holds.
 *
 * The case this exists for: a person who runs a SARL and also files their own
 * income declaration. Seeing both from either file is what stops the firm
 * chasing the same human twice in one week, under two different names.
 */
export function linkedFiles(
  contactId: string,
  links: ContactLink[],
  excludeTaxpayerId?: string,
): string[] {
  return links
    .filter((l) => l.contact_id === contactId && l.taxpayer_id !== excludeTaxpayerId)
    .map((l) => l.taxpayer_id);
}

/** Contacts who will actually be told something about this file. */
export const reachableContacts = (links: ContactLink[], taxpayerId: string) =>
  links.filter((l) => l.taxpayer_id === taxpayerId && l.notifications);

/**
 * Can a reminder for this file reach anyone at all?
 *
 * A silent failure worth catching early: a file whose every contact has
 * notifications off, or has no address on record, is a file nobody will ever be
 * chased about — and the first sign of it is a missed deadline.
 */
export function unreachable(
  links: ContactLink[],
  contacts: Contact[],
  taxpayerId: string,
): boolean {
  const reach = reachableContacts(links, taxpayerId);
  if (reach.length === 0) return true;
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return !reach.some((l) => {
    const c = byId.get(l.contact_id);
    return Boolean(c?.email || c?.phone);
  });
}

export const primaryContact = (
  links: ContactLink[],
  contacts: Contact[],
  taxpayerId: string,
): Contact | null => {
  const link =
    links.find((l) => l.taxpayer_id === taxpayerId && l.is_primary) ??
    links.find((l) => l.taxpayer_id === taxpayerId);
  if (!link) return null;
  return contacts.find((c) => c.id === link.contact_id) ?? null;
};

export const RELATIONSHIPS: { key: Relationship; fr: string; en: string }[] = [
  { key: "owner", fr: "Propriétaire", en: "Owner" },
  { key: "director", fr: "Dirigeant", en: "Director" },
  { key: "employee", fr: "Salarié", en: "Employee" },
  { key: "accountant", fr: "Comptable", en: "Accountant" },
  { key: "self", fr: "Le contribuable lui-même", en: "The taxpayer themselves" },
  { key: "contact", fr: "Contact", en: "Contact" },
];

export const relationshipLabel = (r: Relationship, locale: "fr" | "en") => {
  const found = RELATIONSHIPS.find((x) => x.key === r);
  return found ? (locale === "fr" ? found.fr : found.en) : r;
};
