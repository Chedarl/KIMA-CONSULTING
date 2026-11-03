/**
 * DSF mapping assertions. Compiles the engine with the project's own tsc the
 * same way engine-check.mjs does, then imports the emitted CommonJS.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "kima-dsf-"));
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const args = [join(root, "lib", "dsf-mapping.ts"), "--outDir", out, "--module", "commonjs", "--target", "es2020", "--skipLibCheck", "--strict", "--moduleResolution", "node"];
const r = spawnSync(process.execPath, [tsc, ...args], { encoding: "utf8" });
if (r.status !== 0) {
  console.error(r.stdout || r.stderr || r.error);
  throw new Error("tsc failed");
}
const { mapAccount, normaliseAccount, mapAccounts } = createRequire(import.meta.url)(join(out, "dsf-mapping.js"));

const table = { "70": "Ventes", "701": "Ventes de marchandises", "7011": "Ventes au comptant" };
let count = 0;
const check = (name, fn) => { fn(); count++; console.log("ok  " + name); };

check("a long code matches its four-digit root", () => {
  const m = mapAccount("7011781", table);
  assert.equal(m.root, "7011");
  assert.equal(m.status, "mapped");
});
check("the longest available root wins", () => {
  assert.equal(mapAccount("7010000", table).root, "701");
  assert.equal(mapAccount("7020000", table).root, "70");
});
check("an account with no root is flagged, never defaulted", () => {
  const m = mapAccount("4011", table);
  assert.equal(m.status, "unmapped");
  assert.equal(m.root, null);
});
check("separators do not defeat the match", () => {
  assert.equal(normaliseAccount("7011-781"), "7011781");
  assert.equal(mapAccount("7011 781", table).root, "7011");
});
check("nonsense is unmapped rather than guessed", () => {
  assert.equal(mapAccount("", table).status, "unmapped");
  assert.equal(mapAccount("abc", table).status, "unmapped");
});
check("order is preserved across an import", () => {
  assert.deepEqual(mapAccounts(["7011", "4011", "70"], table).map((m) => m.status), ["mapped", "unmapped", "mapped"]);
});

console.log("\n" + count + " assertions passed");
rmSync(out, { recursive: true, force: true });
