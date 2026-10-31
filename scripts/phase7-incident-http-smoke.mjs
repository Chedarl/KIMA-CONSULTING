/**
 * Phase 7 launch check: exercise the REAL running prototype over HTTP.
 *
 * Usage: node scripts/phase7-incident-http-smoke.mjs http://localhost:3000
 * Pass a preview base URL to validate that deployment instead. This is not
 * a security/RLS audit or a substitute for browser and taxpayer testing.
 */
import assert from "node:assert/strict";

const base = process.argv[2] ?? process.env.KIMA_TEST_BASE_URL;
if (!base) {
  console.error("Usage: node scripts/phase7-incident-http-smoke.mjs <base-url>");
  process.exit(2);
}
let origin;
try {
  origin = new URL(base);
  if (!["http:", "https:"].includes(origin.protocol)) throw new Error("unsupported scheme");
  if (origin.username || origin.password || origin.search || origin.hash) throw new Error("use a clean base URL");
} catch (error) {
  console.error(`Invalid base URL: ${error.message}`);
  process.exit(2);
}

const report = [];
for (const locale of ["fr", "en"]) {
  const url = new URL(`/${locale}/prototype/incident`, origin);
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    assert.equal(response.status, 200, `${locale} must return HTTP 200`);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/i);
    assert.match(body, /<html[^>]*lang=["'](fr|en)["']/i, "document needs a language tag");
    assert.match(body, /<main[^>]*id=["']main["']/i, "main landmark missing");
    assert.match(body, /name=["']robots["'][^>]*noindex/i, "synthetic prototype must not be indexed");
    assert.match(body, /(?:donn[eé]es fictives|synthetic data)/i, "synthetic-data warning missing");
    assert.match(body, locale === "fr"
      ? /Ceci n.est pas une Attestation de Conformit[eé] Fiscale/i
      : /not an? (?:Attestation|Tax Compliance Certificate)/i, "official-certificate disclaimer missing");
    report.push({ locale, url: url.toString(), status: response.status, result: "pass" });
  } catch (error) {
    report.push({ locale, url: url.toString(), result: "fail", error: String(error.message) });
    process.exitCode = 1;
  }
}
console.log(JSON.stringify({ check: "phase7-incident-http-smoke", report }, null, 2));
