/** Synthetic Phase 5 upload preflight regression tests. Run: node scripts/phase5-upload-check.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync("lib/document-upload-validation.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
runInNewContext(compiled, { exports, Uint8Array, Number });
const { validateDocumentContent: validate, MAX_DOCUMENT_BYTES: limit } = exports;
const bytes = (...values) => Uint8Array.from(values);
const pdf = bytes(37, 80, 68, 70, 45, 49, 46, 55);
const jpeg = bytes(255, 216, 255, 1, 2, 255, 217);
const png = bytes(137, 80, 78, 71, 13, 10, 26, 10, 0);
const ok = (b, type) => {
  const result = validate(b, b.length);
  assert.equal(result.ok, true);
  assert.equal(result.detectedType, type);
};
const denied = (b, size, reason) => {
  const result = validate(b, size);
  assert.equal(result.ok, false);
  assert.equal(result.reason, reason);
};
ok(pdf, "application/pdf");
ok(jpeg, "image/jpeg");
ok(png, "image/png");
denied(bytes(), 0, "empty");
denied(pdf, -1, "empty");
denied(pdf, Number.NaN, "empty");
denied(pdf, 1.5, "empty");
denied(pdf, limit + 1, "too_large");
denied(pdf, pdf.length + 1, "unsupported_content");
denied(bytes(77, 90, 144, 0), 4, "unsupported_content");
denied(bytes(255, 216, 255, 1), 4, "unsupported_content");
denied(bytes(137, 80, 78, 71, 0), 5, "unsupported_content");
assert.equal(limit, 10485760);
console.log("ok Phase 5: 14 synthetic upload validation assertions");
