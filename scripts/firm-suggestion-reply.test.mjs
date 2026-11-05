import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { suggestionReply } from "../lib/firm-suggestion-reply.ts";

const named = [{ outcome: "accepted", firm_name: "Cabinet Douala", staff_email: "hidden@firm.test" }];

test("an accepted row names only the firm and still leaves the engagement to accept", () => {
  const fr = suggestionReply("fr", null, named);
  const en = suggestionReply("en", null, named);
  assert.equal(fr.assigned, true);
  assert.match(fr.message, /Cabinet Douala/);
  assert.match(fr.message, /engagement reste à accepter/);
  assert.match(en.message, /engagement still has to be accepted/);
  assert.equal(fr.message.includes("hidden@firm.test"), false);
  assert.equal(en.message.includes("hidden@firm.test"), false);
});

test("decline, expiry, an error, and an empty result assign nothing", () => {
  for (const data of [
    [{ outcome: "declined", firm_name: "Cabinet Douala" }],
    [{ outcome: "expired", firm_name: "Cabinet Douala" }],
    [],
    null,
    [{ firm_name: "Cabinet Douala" }],
  ]) {
    assert.equal(suggestionReply("en", null, data).assigned, false);
    assert.equal(suggestionReply("fr", null, data).assigned, false);
  }
  assert.match(suggestionReply("fr", null, [{ outcome: "expired", firm_name: "X" }]).message, /expiré/);
  assert.match(suggestionReply("en", null, [{ outcome: "declined", firm_name: "X" }]).message, /declined/);
  assert.match(suggestionReply("en", { message: "permission denied" }, named).message, /refused/);
});

test("the routing screen suggests and does not call the assigning RPC", () => {
  const screen = readFileSync("components/live/unassigned-registrations.tsx", "utf8");
  assert.match(screen, /suggest_firm_for_registration/);
  assert.equal(screen.includes("route_unassigned_registration"), false);
  assert.match(screen, /failure\.code === "42501"/);
});
