#!/usr/bin/env node
/**
 * PostToolUse: lint the one file that was just edited.
 *
 * This repository's ESLint configuration carries rules that a reviewer would
 * otherwise have to catch by eye: `jsx-a11y/alt-text` and
 * `@next/next/no-img-element` are errors, not warnings, because the UX goal in
 * docs/design/2026-11-05-ux-redo-goal.md requires every screen to be readable
 * by assistive technology. `eqeqeq` is an error for the same reason the money
 * rules are strict: a loose comparison on an amount or a status string is a
 * correctness bug.
 *
 * Linting the whole project after every edit would be too slow to be useful,
 * so this looks at the single edited file. It reports and never blocks: exit 0
 * always, with any finding written to stderr for the agent to read.
 */
import { execFileSync } from "node:child_process";
import { relative, isAbsolute } from "node:path";

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);

let payload = "";
process.stdin.on("data", (c) => (payload += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(payload || "{}");
  } catch {
    process.exit(0);
  }
  if (!WRITE_TOOLS.has(input.tool_name)) process.exit(0);

  const file = input.tool_input?.file_path ?? "";
  if (!/\.(ts|tsx|js|jsx|mjs)$/.test(file)) process.exit(0);

  const cwd = input.cwd || process.cwd();
  const rel = isAbsolute(file) ? relative(cwd, file) : file;
  if (rel.startsWith("..") || rel.includes("node_modules")) process.exit(0);

  // ESLint exits 0 when a file has warnings only, and this repository's
  // jsx-a11y rules report as warnings. Reading the exit code alone would
  // therefore miss exactly the findings this hook exists for, so the output
  // is read on both paths.
  let out = "";
  try {
    out = execFileSync("npx", ["--no-install", "eslint", rel], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 60000,
      shell: process.platform === "win32",
    });
  } catch (err) {
    out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
  out = out.trim();
  if (out) console.error(`ESLint on ${rel}:\n${out}`);
  process.exit(0);
});
