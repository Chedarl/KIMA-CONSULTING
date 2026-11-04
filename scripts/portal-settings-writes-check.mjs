/**
 * The client settings screen must write through the two definer functions,
 * never through a table update.
 *
 * It used to call `updateById` on `taxpayers`, `contacts` and
 * `contact_account_links`. None of those tables carries a client update
 * policy -- the only non-firm update on `taxpayers` is `to anon`, and an
 * authenticated client is not anon -- so every save matched zero rows and
 * reported a refusal. The screen offered edits it could never store.
 *
 * It must not be "fixed" later by adding an update policy either: an update
 * grant covers every column, and two of them are not the client's.
 * full_name is half the sign-in identifier; organization_id is which firm
 * holds the record. That is why the writes go through
 * update_my_contact_details and set_my_file_notifications instead.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const board = readFileSync("components/client-portal/profile-board.tsx", "utf8");

// T-381  No table update from the settings screen. The call shape, not the
//        word: this file's own comment explains why updateById was removed.
assert.ok(
  !board.includes("updateById("),
  "settings must not write tables directly: no client update policy exists on taxpayers, contacts or contact_account_links",
);

// T-382  Both writes go through their definer function.
for (const fn of ["update_my_contact_details", "set_my_file_notifications"]) {
  assert.ok(board.includes(`rpc("${fn}"`), `settings must save through ${fn}`);
}

// T-383  The name on the file is the firm's record, not a client input.
const legal = board.slice(board.indexOf("{copy.legalName}"), board.indexOf("{copy.niu}"));
assert.ok(
  legal.includes("readOnly"),
  "legal_name is the name on the taxpayer's file; a client retyping it would put the firm out of step with the DGI",
);

// T-384  The signed-in person, not the taxpayer's primary contact. Picking
//        is_primary showed a director someone else's email and offered to
//        edit it.
assert.ok(
  board.includes('.eq("auth_user_id", auth.user.id)'),
  "the contact must be resolved by auth_user_id, the binding RLS uses",
);
assert.ok(
  !board.includes("l.is_primary"),
  "the primary contact is not necessarily the person signed in",
);

console.log("portal settings writes: 5 assertions pass (T-381..T-384)");
