/**
 * Re-fetch the self-hosted typefaces and rewrite app/fonts.css.
 *
 * Run with: npm run fonts
 *
 * The site used to load these through `next/font/google`, which fetched from
 * fonts.gstatic.com at BUILD time and failed CI three times on 30 Oct in diffs
 * that touched no TypeScript. They are now committed under public/fonts and the
 * build reads them off disk. This script is how they get replaced, so the
 * weights, the subsets and the unicode-ranges live in one place rather than
 * being re-derived by hand.
 *
 * It is the only thing here that touches the network, and it runs on request,
 * never as part of a build or a test.
 */

import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(root, "public", "fonts");

/**
 * The pairing is blueprint section 9: Poppins for headings, Inter for body,
 * IBM Plex Mono for tabular figures. latin-ext is not optional — French
 * diacritics live there, and without it accented words fall back mid-word.
 */
const FAMILIES = [
  { slug: "inter", query: "Inter:wght@400;500;600", subsets: ["latin", "latin-ext"], weights: ["400", "500", "600"] },
  { slug: "poppins", query: "Poppins:wght@600;700", subsets: ["latin", "latin-ext"], weights: ["600", "700"] },
  { slug: "plexmono", query: "IBM+Plex+Mono:wght@400;500", subsets: ["latin"], weights: ["400", "500"] },
];

// Google serves woff2 only to a browser-shaped request.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const ORDER = { inter: 0, poppins: 1, plexmono: 2 };

async function faceList(family) {
  const url = `https://fonts.googleapis.com/css2?family=${family.query}&display=swap`;
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`${family.slug}: CSS request returned ${response.status}`);
  const css = await response.text();

  const faces = [];
  // Google precedes each @font-face with a /* subset */ comment.
  for (const [, subset, body] of css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g)) {
    if (!family.subsets.includes(subset)) continue;
    const weight = body.match(/font-weight:\s*(\d+)/)?.[1];
    const src = body.match(/src:\s*url\((https:\/\/[^)]+)\)/)?.[1];
    const range = body.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    if (!weight || !src || !family.weights.includes(weight)) continue;
    faces.push({ slug: family.slug, subset, weight, src, range });
  }
  if (faces.length === 0) throw new Error(`${family.slug}: no matching faces in the served CSS`);
  return faces;
}

async function main() {
  /*
   * Everything is fetched and validated BEFORE anything committed is touched.
   *
   * The first version emptied public/fonts first and downloaded second, so one
   * failed request — offline, a non-200, a parse error — left the directory
   * empty while app/fonts.css still pointed at the files, and the site served
   * no webfont until someone restored them from git. A refresh that fails
   * should leave the fonts exactly as they were.
   */
  const fetched = [];
  for (const family of FAMILIES) {
    for (const face of await faceList(family)) {
      const response = await fetch(face.src, { headers: { "User-Agent": UA } });
      if (!response.ok) throw new Error(`${face.slug} ${face.weight}: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 2000) throw new Error(`${face.slug} ${face.weight}: suspiciously small`);
      fetched.push({ ...face, bytes, hash: createHash("md5").update(bytes).digest("hex") });
    }
  }

  /*
   * Inter is a VARIABLE font: Google serves one file per subset covering the
   * whole 400-600 range, so the three weights all point at identical bytes.
   * Storing it three times would be 166 KB of duplicate. Faces with the same
   * content collapse to one file carrying a weight RANGE; static families keep
   * one file per weight.
   */
  const groups = new Map();
  for (const face of fetched) {
    const key = `${face.slug}|${face.subset}|${face.hash}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(face);
  }

  // Staged in a temp directory, then swapped in one move once the whole set is
  // on disk. Nothing committed is removed until this point.
  const staging = mkdtempSync(join(tmpdir(), "kima-fonts-"));
  const written = [];
  for (const members of groups.values()) {
    const weights = [...new Set(members.map((m) => Number(m.weight)))].sort((a, b) => a - b);
    const variable = weights.length > 1;
    const { slug, subset, range } = members[0];
    const file = variable ? `${slug}-${subset}.woff2` : `${slug}-${weights[0]}-${subset}.woff2`;
    writeFileSync(join(staging, file), members[0].bytes);
    written.push({
      slug,
      subset,
      file,
      range,
      weight: variable ? `${weights[0]} ${weights.at(-1)}` : String(weights[0]),
      family: slug === "inter" ? "Inter" : slug === "poppins" ? "Poppins" : "IBM Plex Mono",
      size: members[0].bytes.length,
    });
  }

  if (written.length === 0) throw new Error("no font files were produced; leaving public/fonts untouched");

  // The swap. Only now does anything committed change.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const f of written) renameSync(join(staging, f.file), join(OUT, f.file));
  rmSync(staging, { recursive: true, force: true });

  written.sort((a, b) => ORDER[a.slug] - ORDER[b.slug] || a.subset.localeCompare(b.subset) || a.weight.localeCompare(b.weight));

  const faces = written
    .map(
      (f) => `
/* ${f.family} ${f.weight} — ${f.subset} */
@font-face {
  font-family: "${f.family}";
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url("/fonts/${f.file}") format("woff2");
  unicode-range: ${f.range};
}`,
    )
    .join("");

  writeFileSync(join(root, "app", "fonts.css"), HEADER + faces + FOOTER);

  const total = written.reduce((n, f) => n + f.size, 0);
  for (const f of written) console.log(`  ${f.file}  weight ${f.weight}  ${Math.round(f.size / 1024)} KB`);
  console.log(`\n${written.length} files, ${Math.round(total / 1024)} KB, app/fonts.css rewritten.`);
  console.log(`${readdirSync(OUT).length} files in public/fonts.`);
}

const HEADER = `/*
 * The three typefaces, served from this origin.
 *
 * GENERATED by scripts/fetch-fonts.mjs (\`npm run fonts\`). Edit that, not this.
 *
 * These were \`next/font/google\`, which fetches from fonts.gstatic.com at BUILD
 * time. That made every \`next build\` depend on an outbound request, and it
 * failed CI three times on 30 Oct — on PRs #30, #34 and #46 — each time in a
 * diff containing no TypeScript at all:
 *
 *     An error occurred in \`next/font\`.
 *     TypeError: Cannot read properties of null (reading '1')
 *
 * A build that reaches the network fails for reasons that have nothing to do
 * with the change under review, and three re-runs spent on it is three reviews
 * delayed.
 *
 * WHY THESE ARE HAND-WRITTEN RATHER THAN \`next/font/local\`. Each family needs
 * TWO files, latin and latin-ext, with different \`unicode-range\` values, and
 * \`next/font/local\` cannot express unicode-range: it would treat them as one
 * face, keep the first and drop the other. The dropped one would be latin-ext,
 * which is where French diacritics live, so accented words would fall back
 * mid-word to the system font — precisely what the layout's own comment said
 * the latin-ext subset was there to prevent.
 *
 * Inter is a VARIABLE font: Google serves one file per subset covering 400–600,
 * so its faces carry a weight RANGE and there is no file per weight. Poppins
 * and IBM Plex Mono are static. The unicode-range values are Google's own,
 * copied with the files, so coverage is identical to what the site served
 * before.
 */
`;

const FOOTER = `

/*
 * next/font used to put these on <body> through generated class names. On
 * :root they resolve everywhere, which is what globals.css's \`body\` block and
 * every \`var(--font-*)\` consumer already expect.
 */
:root {
  --font-inter: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-poppins: "Poppins", ui-sans-serif, system-ui, sans-serif;
  --font-plex-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
}
`;

await main();
