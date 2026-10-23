/**
 * What belongs in the evidence vault.
 *
 * The inbox is the arrival desk: a document can be received and still not
 * accepted. The vault holds what the firm has accepted into the record, and
 * filing acknowledgments that carry a reference. A failed accounting verdict
 * does not remove a document — acceptance is `review_status`, not a passing
 * grade. Filing evidence is the same rule the client archive uses: verified,
 * and a reference, or it is not evidence.
 */

export function acceptedIntoVault(doc: { review_status: string }): boolean {
  return doc.review_status === "accepted";
}

export function filingEvidence(c: {
  filing_status: string;
  filing_evidence_ref: string | null;
}): boolean {
  return c.filing_status === "verified" && Boolean(c.filing_evidence_ref?.trim());
}
