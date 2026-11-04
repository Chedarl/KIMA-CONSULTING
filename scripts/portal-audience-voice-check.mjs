import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Taxpayer type is the first of the four axes and it drives the portal
// (CLAUDE.md). The portal addressed every taxpayer as a company, so a salarié
// filing IRPP was told "Votre entreprise" and offered "Changer d'entreprise".
// These assertions keep the individual's wording from regressing to it.
const dict = readFileSync("lib/i18n-portal.ts", "utf8");
const copy = readFileSync("components/client-portal/copy.tsx", "utf8");
const dictLines = dict.split("\n").map((line) => line.replace("\r", ""));

// 1. The override block exists in both languages and covers the same keys.
const block = dict.match(/const individualVoice = \{([\s\S]*?)\n\} as const;/);
assert.ok(block, "individualVoice is gone from lib/i18n-portal.ts");
const fr = block[1].match(/fr: \{([\s\S]*?)\n  \},/);
const en = block[1].match(/en: \{([\s\S]*?)\n  \},/);
assert.ok(fr && en, "individualVoice must carry both an fr and an en block");
const keysOf = (m) => [...m[1].matchAll(/^\s{4}(\w+):/gm)].map((x) => x[1]).sort();
assert.deepEqual(
  keysOf(fr),
  keysOf(en),
  "the individual voice must override the same keys in French and English",
);
assert.ok(keysOf(fr).length > 0, "the individual voice overrides nothing");

// 2. Every overridden key is a real dictionary key, or the override is dead
//    weight that type-checks only because the shapes are loose.
for (const key of keysOf(fr)) {
  assert.ok(
    dictLines.some((line) => line.startsWith("  " + key + ":")),
    'individualVoice overrides "' + key + '", which is not a portal copy key',
  );
}

// 3. No company noun survives into the individual's wording.
const company = new RegExp("entreprise|societe|société|business|company", "i");
for (const [lang, m] of [["fr", fr], ["en", en]]) {
  for (const hit of m[1].matchAll(/^\s{4}\w+: "([^"]*)",/gm)) {
    assert.ok(
      !company.test(hit[1]),
      "the " + lang + " individual voice still calls the taxpayer a company: " + hit[1],
    );
  }
}

// 4. The voice is applied where every screen reads its copy, not screen by
//    screen -- that is the only way one missed import cannot undo it.
assert.match(
  copy,
  /export function usePortalCopy[\s\S]*withAudienceVoice/,
  "usePortalCopy must apply withAudienceVoice so every portal screen inherits the audience",
);
assert.match(
  copy,
  /useEffect\([\s\S]*readSession\(\)/,
  "the session must be read after mount; reading it during render mismatches hydration",
);

console.log("ok portal voice: the portal addresses an individual as an individual");
