import assert from "node:assert/strict";
import { signInRedirectPath } from "./auth-redirect.mjs";

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

console.log("auth-redirect: 9 cases ok");
