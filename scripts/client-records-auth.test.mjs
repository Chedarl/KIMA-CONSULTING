import assert from "node:assert/strict";
import test from "node:test";
import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/auth-js";
import { recordsAuthFailure } from "../lib/client-records-auth.ts";

test("a missing auth session is signed out, not offline", () => {
  const error = new AuthSessionMissingError();
  assert.equal(error.status, 400);
  assert.equal(recordsAuthFailure(error), "signed-out");
});

test("401 and 403 are signed out", () => {
  assert.equal(recordsAuthFailure({ status: 401, message: "unauthorized" }), "signed-out");
  assert.equal(recordsAuthFailure({ status: 403, message: "forbidden" }), "signed-out");
});

test("a retryable fetch and an error with no status are offline", () => {
  assert.equal(recordsAuthFailure(new AuthRetryableFetchError("network down", 0)), "offline");
  assert.equal(recordsAuthFailure(new AuthRetryableFetchError("unavailable", 503)), "offline");
  assert.equal(recordsAuthFailure({ message: "no status" }), "offline");
});
