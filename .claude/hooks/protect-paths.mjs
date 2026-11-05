#!/usr/bin/env node
/**
 * PreToolUse guard: refuse a write to a path that must never be edited by an
 * agent in place.
 *
 * Two classes of path are protected, for different reasons.
 *
 * Secrets (`.env` and friends) must not be written because this repository is
 * public-facing and a key committed once is a key leaked permanently. The
 * existing `permissions.deny` in settings.json already stops a *read*; this
 * stops a write, which `deny` does not cover.
 *
 * An already-applied migration under `supabase/migrations/` must not be edited
 * because migrations here are forward-only and production has no
 * point-in-time recovery (see docs/deployment.md). Editing a file that the
 * `Supabase migrations` workflow has already applied puts the local history
 * and the remote database permanently out of step: the remote keeps the old
 * statements, the repository claims the new ones, and nothing detects the
 * difference. A correction is a new migration, never an edit.
 *
 * Exit 0 allows the call. Exit 2 blocks it and shows stderr to the agent.
 */
import { execSync } from "node:child_process";

const SECRET = /(^|[\/])\.env(\.|$)/i;
const MIGRATION = /supabase[\/]migrations[\/].+\.sql$/i;
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

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

  const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "";
  if (!path) process.exit(0);

  if (SECRET.test(path)) {
    console.error(
      `Refused: ${path} holds secrets. Put the variable in .env.example with an empty value and tell the owner what to set.`,
    );
    process.exit(2);
  }

  if (MIGRATION.test(path)) {
    // A file that is not yet in origin/main has not been applied anywhere, so
    // it is still a draft the agent may edit.
    let tracked = true;
    try {
      const rel = path.split("\\").join("/").replace(/^.*?(supabase\/)/, "$1");
      execSync(`git cat-file -e origin/main:"${rel}"`, {
        stdio: "ignore",
      });
    } catch {
      tracked = false;
    }
    if (tracked) {
      console.error(
        `Refused: ${path} is already on origin/main, so the Supabase migrations workflow has applied it. Migrations are forward-only and production has no point-in-time recovery. Write a new migration instead.`,
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
