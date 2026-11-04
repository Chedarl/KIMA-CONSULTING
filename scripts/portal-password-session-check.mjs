/**
 * A password sign-in must leave a portal session behind.
 *
 * Every portal screen resolves its taxpayer through `sessionTaxpayerId()`,
 * which reads `kima.portal.session` from sessionStorage. The one-time-code
 * route always wrote it. The password route authenticated and navigated without
 * writing it, so a client who signed in correctly reached a portal where
 * requests, documents, payments, messages and the profile all rendered their
 * empty branch. It looked like five broken pages; it was one missing write.
 *
 * These assertions read source, not behaviour, which is the point: they fail
 * the build the moment the write is removed again, without needing a browser.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const login = readFileSync("components/live/portal-login.tsx", "utf8");
const auth = readFileSync("lib/portal-auth.ts", "utf8");

// T-368  The password handler resolves a portal session.
assert.match(
  login,
  /async function signInWithPassword\(\)[\s\S]*?sessionFromAuthUser\(\)/,
  "signInWithPassword must resolve a portal session, not just an auth session",
);

// T-369  It stores that session before leaving the page.
const handler = login.slice(
  login.indexOf("async function signInWithPassword()"),
  login.indexOf("async function submitCode()"),
);
assert.ok(
  handler.includes("rememberSession(resolved)"),
  "the resolved session must be stored, or every portal screen loses its taxpayer",
);
assert.ok(
  handler.indexOf("rememberSession(resolved)") < handler.indexOf("window.location.assign"),
  "the session must be stored before navigating away",
);

// T-370  Authenticated but unlinked is refused, not shown an empty portal.
assert.ok(
  handler.includes("if (!resolved)") && handler.includes("clearSession()"),
  "a caller bound to no taxpayer must be signed out and told, not sent to an empty portal",
);

// T-371  The taxpayer comes from the database bridge, never from the browser.
const resolver = auth.slice(auth.indexOf("export async function sessionFromAuthUser"));
assert.ok(
  resolver.includes('db.rpc("client_taxpayer_ids")'),
  "the taxpayer must come from client_taxpayer_ids(), the same binding RLS uses",
);

// T-372  The audience follows the taxpayer's type, not the chosen tab.
assert.ok(
  /audience: \(type \? taxpayerType\(type\)\?\.family : null\)/.test(resolver),
  "audience must be derived from taxpayer_type, so a wrong tab cannot place a client",
);

console.log("portal password session: 5 assertions pass (T-368..T-372)");
