import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

// The firm rail is seven destinations. The point of this check is the second
// assertion: consolidating the rail must never orphan a screen. Any route that
// renders a page has to be reachable from the rail or from a section's tabs.
const navSrc = readFileSync("lib/workspace-nav.ts", "utf8");
const dict = readFileSync("lib/i18n-workspace.ts", "utf8");

const sections = [...navSrc.matchAll(/\{\s*key:\s*"([a-z]+)",\s*path:\s*"([^"]*)"/g)].map(
  (m) => ({ key: m[1], path: m[2] }),
);
assert.ok(sections.length > 0, "no sections parsed from lib/workspace-nav.ts");
assert.equal(
  sections.length,
  7,
  `the rail is ${sections.length} destinations; the update document specifies 7`,
);
assert.equal(
  new Set(sections.map((s) => s.key)).size,
  sections.length,
  "two sections share a key",
);

const tabPaths = [...navSrc.matchAll(/\{\s*path:\s*"([^"]*)",\s*tabKey:\s*"([^"]+)"/g)].map(
  (m) => ({ path: m[1], tabKey: m[2] }),
);

// Every tab label must resolve in the firm nav dictionary, in both languages.
// The dictionary holds one FR block and one EN block, so a key present in both
// appears at least twice.
for (const { tabKey } of tabPaths) {
  const hits = dict.split(`${tabKey}:`).length - 1;
  assert.ok(
    hits >= 2,
    `firm nav label "${tabKey}" must exist in both the FR and EN dictionaries (found ${hits})`,
  );
}

// Every route that renders a page is reachable. A route whose page only
// redirects is deliberately not in the rail -- that is what folding a screen
// means -- so those are skipped.
const root = "app/[locale]/workspace";
const reachable = new Set([
  ...sections.map((s) => s.path),
  ...tabPaths.map((t) => t.path),
]);

const orphans = [];
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith("[")) continue;
  const page = `${root}/${entry.name}/page.tsx`;
  if (!existsSync(page)) continue;
  const body = readFileSync(page, "utf8");
  const isRedirect = /redirect\(`\/\$\{params\.locale\}\/workspace/.test(body);
  if (isRedirect) continue;
  if (!reachable.has(`/${entry.name}`)) orphans.push(entry.name);
}

assert.deepEqual(
  orphans,
  [],
  `these screens render but cannot be reached from the rail or any tab: ${orphans.join(", ")}. ` +
    "Add each to a section's tabs in lib/workspace-nav.ts, or fold the route into a redirect.",
);

console.log(
  `ok workspace nav: ${sections.length} destinations, ${tabPaths.length} tabs, no orphaned screens`,
);
