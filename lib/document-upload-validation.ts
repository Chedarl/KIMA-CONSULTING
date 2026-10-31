/** Phase 5: fail-closed content signature validation before private storage upload.
 * This is a client/server shared preflight; server must independently enforce
 * size, scan policy, authenticated engagement, RLS and private storage access.
 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export type AllowedDocumentType = "application/pdf" | "image/jpeg" | "image/png";
export type DocumentValidation =
  | { ok: true; detectedType: AllowedDocumentType }
  | { ok: false; reason: "empty" | "too_large" | "unsupported_content" };

const matches = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((value, i) => bytes[offset + i] === value);

/** Extension and browser-provided MIME are deliberately ignored. */
export function validateDocumentContent(
  bytes: Uint8Array,
  declaredSize: number,
): DocumentValidation {
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || bytes.length === 0)
    return { ok: false, reason: "empty" };
  if (declaredSize > MAX_DOCUMENT_BYTES || bytes.length > MAX_DOCUMENT_BYTES)
    return { ok: false, reason: "too_large" };
  if (bytes.length !== declaredSize) return { ok: false, reason: "unsupported_content" };
  if (matches(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { ok: true, detectedType: "application/pdf" };
  if (matches(bytes, [0xff, 0xd8, 0xff]) &&
      matches(bytes, [0xff, 0xd9], bytes.length - 2))
    return { ok: true, detectedType: "image/jpeg" };
  if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { ok: true, detectedType: "image/png" };
  return { ok: false, reason: "unsupported_content" };
}
