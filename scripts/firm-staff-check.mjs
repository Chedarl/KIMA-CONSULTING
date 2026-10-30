/**
 * Staff management contracts: the database's refusals, the words for them, and
 * French/English parity.
 *
 * The screen tells a partner WHY a change was refused, and three of the seven
 * refusals are things only they can fix — "that address belongs to a client
 * account" is useless as "could not save". That only works while the migration
 * and `lib/firm-staff.ts` agree on the messages, and nothing made them agree.
 * So this parses the migration and fails when they drift, which is the same
 * shape of guard as T-22 over `engagements_status_known`.
 *
 * Run with: npm run test:staff
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
function eq(a, b, message) {
  assert.deepEqual(a, b, message);
  assertions += 1;
}
function ok(value, message) {
  assert.ok(value, message);
  assertions += 1;
}

const dir = join(root, "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n"))
  .join("\n");

const body = sql.slice(sql.indexOf("create function public.manage_firm_staff"));
ok(body.startsWith("create function public.manage_firm_staff"), "manage_firm_staff() not found");
const fn = body.slice(0, body.indexOf("\nend $$;"));

const wrapper = readFileSync(join(root, "lib", "firm-staff.ts"), "utf8");

check("every refusal manage_firm_staff() raises has words in both locales", () => {
  // raise exception '...' — the message is the first quoted string after it.
  const raised = [...fn.matchAll(/raise exception\s+'((?:[^']|'')*)'/g)].map((m) =>
    m[1].replace(/''/g, "'").toLowerCase(),
  );
  ok(raised.length >= 7, `expected at least 7 raises, found ${raised.length}`);

  // Scoped to the signatures table: an unscoped match also picked up
  // ASSIGNABLE_STAFF_ROLES and claimed the migration no longer raised
  // "firm_staff", which it never did.
  const table = wrapper.slice(
    wrapper.indexOf("STAFF_REFUSAL_SIGNATURES"),
    wrapper.indexOf("export function staffRefusal"),
  );
  const signatures = [...table.matchAll(/\["([^"]+)",\s*"([a-z_]+)"\]/g)].map((m) => ({
    signature: m[1].toLowerCase(),
    refusal: m[2],
  }));
  ok(signatures.length >= 7, `expected at least 7 signatures, found ${signatures.length}`);

  for (const message of raised) {
    const hit = signatures.find((s) => message.includes(s.signature));
    ok(
      hit,
      `manage_firm_staff() raises "${message}" and lib/firm-staff.ts carries no signature for it`,
    );
  }

  // And nothing stale on the other side: every signature must still be raised.
  for (const { signature } of signatures) {
    ok(
      raised.some((m) => m.includes(signature)),
      `lib/firm-staff.ts carries "${signature}" but the migration no longer raises it`,
    );
  }
});

check("a partner cannot assign partner or KIMA administrator", () => {
  const assignable = wrapper.match(/ASSIGNABLE_STAFF_ROLES = \[([^\]]+)\]/);
  ok(assignable, "ASSIGNABLE_STAFF_ROLES not found");
  const roles = [...assignable[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  eq(roles, ["firm_staff", "firm_reviewer"], "only staff and reviewer are assignable");
  // The migration has to agree, or the screen offers a role the database refuses.
  ok(
    fn.includes("p_role not in ('firm_staff','firm_reviewer')"),
    "the migration no longer restricts the assignable roles to the same two",
  );
});

check("the staff screen has French and English parity", () => {
  const dict = readFileSync(join(root, "lib", "i18n-workspace.ts"), "utf8");
  const blocks = [...dict.matchAll(/staffPage: \{([\s\S]*?)\n    \},/g)].map((m) => m[1]);
  eq(blocks.length, 2, "expected exactly two staffPage blocks, one per locale");

  const keysOf = (block) => {
    // Top-level keys only: a nested object's keys are indented further.
    const keys = [...block.matchAll(/^ {6}([a-zA-Z_]+):/gm)].map((m) => m[1]);
    return [...new Set(keys)].sort();
  };
  const [fr, en] = blocks.map(keysOf);
  eq(fr, en, "the two staffPage blocks do not carry the same keys");
  ok(fr.includes("noEmailSent"), "the screen must state that no email is sent");
  ok(fr.includes("partnerNotAssignable"), "the screen must state what is not assignable");

  // Every refusal the wrapper can return needs words, in both locales.
  // Scoped to the StaffRefusal union: unscoped, this also matched the action
  // union ("invite" | "role" | "revoke") and asked for words for "role".
  const union = wrapper.slice(
    wrapper.indexOf("export type StaffRefusal"),
    wrapper.indexOf("STAFF_REFUSAL_SIGNATURES"),
  );
  const refusalNames = [...union.matchAll(/\| "([a-z_]+)"/g)].map((m) => m[1]);
  ok(refusalNames.length >= 8, `expected the refusal union, found ${refusalNames.length}`);
  for (const block of blocks) {
    const refusals = block.slice(block.indexOf("refusals: {"));
    for (const name of refusalNames) {
      ok(
        new RegExp(`\\b${name}:`).test(refusals),
        `refusal "${name}" has no words in one of the locales`,
      );
    }
  }
});

check("nothing writes firm_members except through the function", () => {
  // The screen reads the table and writes nothing: the only route in is the
  // RPC, because firm_members has no write policy.
  const screen = readFileSync(join(root, "components", "live", "staff-workspace.tsx"), "utf8");
  ok(screen.includes('.from("firm_members")'), "the screen should read the staff list");
  for (const write of [".insert(", ".update(", ".upsert(", ".delete("]) {
    ok(
      !screen.includes(`"firm_members")${write}`) && !screen.includes(`firm_members").${write}`),
      `the screen must not ${write} firm_members directly`,
    );
  }
  ok(wrapper.includes('rpc("manage_firm_staff"'), "the wrapper should call the RPC");
});

console.log(`\n${checks} checks, ${assertions} assertions passed.`);
