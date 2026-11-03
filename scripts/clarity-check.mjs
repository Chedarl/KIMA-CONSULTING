import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "kima-clarity-"));
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const args = [join(root, "lib", "clarity.ts"), "--outDir", out, "--module", "commonjs", "--target", "es2020", "--skipLibCheck", "--strict", "--moduleResolution", "node"];
const r = spawnSync(process.execPath, [tsc, ...args], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stdout || r.stderr); throw new Error("tsc failed"); }
const { ask, score } = createRequire(import.meta.url)(join(out, "clarity.js"));

const sources = [
  { id: "vat", citation: "CGI art. 142", title: "TVA au taux normal", body: "Le taux normal de la TVA est de 19,25 %.", verified: true, terms: ["tva", "taux", "normal", "vente"] },
  { id: "patente", citation: "LF 2025 art. 12 (a verifier)", title: "Patente", body: "La patente se renouvelle avant le 28 fevrier.", verified: false, terms: ["patente", "renouvellement", "fevrier"] },
];

let count = 0;
const check = (name, fn) => { fn(); count++; console.log("ok  " + name); };

check("a verified source answers and is cited", () => {
  const a = ask("Quel est le taux de TVA normal sur une vente ?", sources, "fr");
  assert.equal(a.kind, "answer");
  assert.equal(a.sourceId, "vat");
  assert.ok(a.text.includes("CGI art. 142"));
});
check("an unverified source is refused, not used", () => {
  const a = ask("patente renouvellement fevrier", sources, "fr");
  assert.equal(a.kind, "refusal");
  assert.equal(a.reason, "unverified");
  assert.equal(a.sourceId, "patente");
});
check("an unrelated question is refused with the tax-centre advice", () => {
  const a = ask("Comment exporter des mangues ?", sources, "fr");
  assert.equal(a.kind, "refusal");
  assert.equal(a.reason, "no_match");
  assert.ok(/centre des imp/i.test(a.text));
});
check("the refusal speaks the requested language", () => {
  const a = ask("Quel est le taux de TVA normal ?", [], "en");
  assert.ok(/tax centre/i.test(a.text));
});
check("scoring counts distinct matching terms", () => {
  assert.equal(score("tva taux normal", sources[0].terms), 3);
  assert.equal(score("mangue", sources[0].terms), 0);
});

console.log("\n" + count + " assertions passed");
rmSync(out, { recursive: true, force: true });
