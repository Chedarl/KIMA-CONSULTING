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
const args = [join(root, "lib", "dsf-mapping.ts"), join(root, "lib", "dsf-import.ts"), "--outDir", out, "--module", "commonjs", "--target", "es2020", "--skipLibCheck", "--strict", "--moduleResolution", "node"];
const r = spawnSync(process.execPath, [tsc, ...args], { encoding: "utf8" });
if (r.status !== 0) {
  console.error(r.stdout || r.stderr || r.error);
  throw new Error("tsc failed");
}
const { mapAccount, normaliseAccount, mapAccounts } = createRequire(import.meta.url)(join(out, "dsf-mapping.js"));
const { importLedger, detectColumns, parseXaf, exportLedgerCsv } = createRequire(import.meta.url)(join(out, "dsf-import.js"));

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

check("a French header is understood", () => {
  const cols = detectColumns(["Compte", "Libellé", "Débit", "Crédit"]);
  assert.ok(cols);
  assert.equal(cols.account, 0);
  assert.equal(cols.debit, 2);
});
check("a header without an amount column is refused, not guessed", () => {
  assert.equal(detectColumns(["Compte", "Libellé"]), null);
});
check("amounts must be whole XAF", () => {
  assert.equal(parseXaf("1 250 000"), 1250000);
  assert.equal(parseXaf("1250000"), 1250000);
  assert.equal(parseXaf("12,50"), 1250);
  assert.equal(parseXaf("abc"), null);
  assert.equal(parseXaf(""), 0);
});
check("an import totals what it read and flags what it could not", () => {
  const csv = ["Compte;Libellé;Débit;Crédit", "7011000;Ventes;0;2500000", "4011000;Achats;1200000;0", "9999;Inconnu;abc;0"].join("\n");
  const res = importLedger(csv, table);
  assert.equal(res.rows.length, 3);
  assert.equal(res.totalDebitXaf, 1200000);
  assert.equal(res.totalCreditXaf, 2500000);
  assert.equal(res.unmappedCount, 2);
  assert.equal(res.invalidCount, 1);
  assert.equal(res.rows[2].issues[0], "amount_not_integer");
});
check("a quoted label keeps its separator", () => {
  const csv = ['Compte,Libellé,Débit,Crédit', '7011,"Ventes, comptant",0,100'].join("\n");
  const res = importLedger(csv, table);
  assert.equal(res.rows[0].label, "Ventes, comptant");
});

check("export keeps the mapping decision and the defects", () => {
  const csv = ["Compte;Libellé;Débit;Crédit", '7011000;"Ventes, comptant";0;2500000', "9999;X;abc;0"].join("\n");
  const res = importLedger(csv, table);
  const out2 = exportLedgerCsv(res.rows);
  const lines = out2.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("line,account,label"));
  assert.ok(lines[1].includes('"Ventes, comptant"'));
  assert.ok(lines[1].includes("7011,Ventes au comptant"));
  assert.ok(lines[2].includes("amount_not_integer"));
});

console.log("\n" + count + " assertions passed");
rmSync(out, { recursive: true, force: true });
