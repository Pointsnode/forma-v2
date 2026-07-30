import assert from "node:assert/strict";
import { signInRedirectPath, safeNextPath } from "./auth-redirect.mjs";

const locales = ["en", "es"];
const def = "en";
const p = (path) => signInRedirectPath(path, locales, def);

// Spanish requests keep their prefix through the bounce.
assert.equal(p("/es"), "/es/sign-in");
assert.equal(p("/es/"), "/es/sign-in");
assert.equal(p("/es/cockpit"), "/es/sign-in");
assert.equal(p("/es/weddings/abc-123"), "/es/sign-in");

// Default locale is unprefixed.
assert.equal(p("/"), "/sign-in");
assert.equal(p("/cockpit"), "/sign-in");
assert.equal(p("/weddings/abc-123"), "/sign-in");

// A path that merely starts with the locale letters is NOT a locale prefix.
assert.equal(p("/espanol"), "/sign-in");
assert.equal(p("/enterprise"), "/sign-in");

// safeNextPath (M15 ?next open-redirect guard) — accept only same-origin relative paths.
assert.equal(safeNextPath("/join/team/abc-123"), "/join/team/abc-123"); // the real use
assert.equal(safeNextPath("/es/join/team/xyz"), "/es/join/team/xyz"); // prefixed is fine
assert.equal(safeNextPath("/"), "/"); // bare root ok (caller may still prefer cockpit)
// Rejections → null (caller falls back to "/"):
assert.equal(safeNextPath("//evil.com"), null); // protocol-relative
assert.equal(safeNextPath("https://evil.com"), null); // absolute URL
assert.equal(safeNextPath("http://evil.com/x"), null);
assert.equal(safeNextPath("/\\evil.com"), null); // backslash the browser may fold to /
assert.equal(safeNextPath("/foo\nbar"), null); // header-injection / whitespace
assert.equal(safeNextPath("javascript:alert(1)"), null); // no leading slash
assert.equal(safeNextPath("join/team/x"), null); // relative without leading slash
assert.equal(safeNextPath(""), null);
assert.equal(safeNextPath(null), null);
assert.equal(safeNextPath(undefined), null);
assert.equal(safeNextPath("/" + "a".repeat(600)), null); // length cap

console.log("auth-redirect: 24 cases ok");
