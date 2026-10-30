import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const source = readFileSync(fileURLToPath(new URL("../components/live/staff-workspace.tsx", import.meta.url)), "utf8");
assert.ok(source.includes("subscribeFirmSession"), "staff screen must follow firm session");
assert.ok(source.includes('.from("firm_members")'), "staff list must use RLS");
assert.ok(!/\.from\("firm_members"\)\s*\.(insert|update|upsert|delete)/.test(source), "no direct member writes");
console.log("staff screen contract passed");
