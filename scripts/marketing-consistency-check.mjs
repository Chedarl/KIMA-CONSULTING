/**
 * The public site says what is actually open, and does not claim what KIMA
 * cannot do.
 *
 * Run with: npm run test:marketing
 *
 * Two kinds of drift this catches, both of which would reach a visitor:
 *
 *   1. The pricing section offering a workspace that is not open, or offering
 *      an open one under another plan's words. It used to pair
 *      OPEN_WORKSPACE_KINDS with t.pricing BY POSITION, which worked only while
 *      both arrays began with the same two entries in the same order.
 *
 *   2. Copy that claims a tax-authority authorization, partnership or e-filing
 *      integration. CLAUDE.md forbids representing any of those as established,
 *      and the site currently disclaims them in as many words — this asserts
 *      the disclaimer is still there, in both locales, rather than trusting it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
let checks = 0;
let assertions = 0;

function check(name, fn) {
  fn();
  checks += 1;
  console.log(`ok  ${name}`);
}
function ok(value, message) {
  assert.ok(value, message);
  assertions += 1;
}
function eq(a, b, message) {
  assert.deepEqual(a, b, message);
  assertions += 1;
}

const copy = readFileSync(join(root, "lib", "i18n-public.ts"), "utf8");
const onboarding = readFileSync(join(root, "lib", "public-onboarding.ts"), "utf8");
const home = readFileSync(join(root, "components", "marketing", "home-page.tsx"), "utf8");

const openKinds = [
  ...(onboarding.match(/OPEN_WORKSPACE_KINDS = \[([^\]]+)\]/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g),
].map((m) => m[1]);

const planBlocks = [...copy.matchAll(/pricing: \[([\s\S]*?)\n {4}\],/g)].map((m) => m[1]);

check("every pricing plan names the workspace kind it belongs to", () => {
  eq(planBlocks.length, 2, "expected one pricing block per locale");
  ok(openKinds.length > 0, "OPEN_WORKSPACE_KINDS not found");
  for (const block of planBlocks) {
    const titles = [...block.matchAll(/title: "/g)].length;
    const kinds = [...block.matchAll(/kind: "([a-z_]+)"/g)].map((m) => m[1]);
    eq(
      kinds.length,
      titles,
      "a pricing plan has no `kind`, so the home page cannot tell which workspace it is for",
    );
    for (const kind of kinds) {
      ok(
        onboarding.includes(`"${kind}"`),
        `pricing names the workspace kind "${kind}", which lib/public-onboarding.ts does not define`,
      );
    }
  }
  const [fr, en] = planBlocks.map((b) => [...b.matchAll(/kind: "([a-z_]+)"/g)].map((m) => m[1]));
  eq(fr, en, "the two locales list the pricing plans in a different order or set");
});

check("the home page offers only the workspaces that are open", () => {
  ok(
    home.includes("isOpenWorkspaceKind(plan.kind)"),
    "the pricing section must filter plans by kind, not pair them by position",
  );
  ok(
    !/OPEN_WORKSPACE_KINDS\.map\(/.test(home),
    "pairing OPEN_WORKSPACE_KINDS with t.pricing by index renders one plan's words under another plan's link",
  );
});

check("the firm plan does not promise a review that no longer happens", () => {
  // The owner chose instant sign-up over admin approval on 30 Oct (R-57). The
  // copy said "activation goes through a review", which is now false — and it
  // is the card that appears the moment the flag flips.
  const forbidden = [
    /activation (goes through|is subject to) a review/i,
    /l['’]activation passe par une revue/i,
    /request a firm workspace/i,
    /demander un espace cabinet/i,
  ];
  for (const block of planBlocks) {
    const firm = block.slice(block.indexOf('kind: "accounting_firm"'));
    ok(firm.length > 0, "no accounting_firm plan found");
    for (const pattern of forbidden) {
      ok(
        !pattern.test(firm),
        `the accounting-firm plan still says something matching ${pattern}, but sign-up is instant`,
      );
    }
    ok(
      /unverified|non vérifié/i.test(firm),
      "the firm plan must say the workspace starts unverified, which is the safeguard that replaced the review",
    );
  }
});

check("the site claims no tax-authority authorization, partnership or e-filing", () => {
  // CLAUDE.md: never represent DGI access, e-filing capability, authorization
  // or partnership as established. The copy disclaims all three outright; this
  // asserts the disclaimer rather than trusting that nobody deleted it.
  ok(
    /No tax-authority authorization, partnership or e-filing integration is established or claimed/.test(copy),
    "the English disclaimer about authorization, partnership and e-filing is gone",
  );
  ok(
    /Aucune autorisation, aucun partenariat et aucune intégration de télédéclaration[\s\S]{0,60}n['’]est établi/.test(copy),
    "the French disclaimer about authorization, partnership and e-filing is gone",
  );
  ok(
    /dépôt officiel/.test(copy) && /l['’]envoi externe reste une décision humaine/.test(copy),
    "the copy must keep saying that external submission stays a human decision",
  );
});

console.log(`\n${checks} checks, ${assertions} assertions passed.`);
