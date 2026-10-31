import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Light marketing and client-portal scopes must not inherit dark-mode success
// or danger. Done badges use success-text on success-soft.
const css = readFileSync("app/globals.css", "utf8");

function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}"));
  assert.ok(match, "missing " + selector);
  return match[1];
}

function has(scope, token, value) {
  const body = block(scope);
  const pattern = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*" + value);
  assert.match(body, pattern, scope + " must set " + token + " to " + value);
}

for (const scope of [".public-site", ".client-portal"]) {
  has(scope, "--success", "21 128 61");
  has(scope, "--success-text", "22 101 52");
  has(scope, "--success-soft", "232 245 236");
}
has(".public-site", "--danger", "214 69 69");
has(".client-portal", "--danger", "214 69 69");
has(".public-site", "--danger-text", "185 28 28");
has(".public-site", "--danger-soft", "254 232 232");

const page = readFileSync("app/[locale]/design/page.tsx", "utf8");
assert.match(page, /token: "--success", hex: "#15803D", role: "fill"/);
assert.match(page, /token: "--success-text", hex: "#166534", role: "text"/);

console.log("ok light scopes pin success and danger");
