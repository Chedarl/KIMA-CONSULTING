import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { grantRpcMessage, grantRpcRefusal } from "../lib/engagements.ts";

const formerClient = "a former client must accept again before this firm can be re-authorised";
const authorizedRevoked =
  'new row for relation "engagements" violates check constraint "engagements_authorized_is_not_revoked"';

test("42501 from a returning-client re-authorisation asks the client to accept", () => {
  assert.equal(
    grantRpcRefusal({ code: "42501", message: formerClient }),
    "awaiting_client_acceptance",
  );
  assert.match(grantRpcMessage("fr", { code: "42501", message: formerClient }) ?? "", /acceptation du client/);
  assert.match(grantRpcMessage("en", { code: "42501", message: formerClient }) ?? "", /Waiting for the client to accept/);
});

test("23514 authorized-and-revoked tells the firm to start a new engagement", () => {
  assert.equal(
    grantRpcRefusal({ code: "23514", message: authorizedRevoked }),
    "revoked_needs_new_engagement",
  );
  assert.match(grantRpcMessage("fr", { code: "23514", message: authorizedRevoked }) ?? "", /nouvelle mission/);
  assert.match(grantRpcMessage("en", { code: "23514", message: authorizedRevoked }) ?? "", /Start a new engagement/);
});

test("other 42501 and 23514 messages stay unmapped", () => {
  assert.equal(grantRpcRefusal({ code: "42501", message: "only a signed-in member of a firm can approve an application" }), null);
  assert.equal(grantRpcRefusal({ code: "23514", message: "illegal case stage transition" }), null);
  assert.equal(grantRpcRefusal(null), null);
});

test("open_client_file surfaces the mapped message instead of the raw error", () => {
  const wizard = readFileSync("components/live/onboarding-wizard.tsx", "utf8");
  const rpc = wizard.indexOf('rpc("open_client_file"');
  const mapped = wizard.indexOf("grantRpcMessage(locale, openErr)");
  assert.ok(rpc > 0 && mapped > rpc, "the wizard maps the open_client_file error");
});
