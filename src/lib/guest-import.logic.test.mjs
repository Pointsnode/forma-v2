import assert from "node:assert/strict";
import { parseGuestRows, dedupeGuests } from "./guest-import.mjs";

// parse
const parsed = parseGuestRows("Ana Ruiz, ana@x.com, +52 55 1234 5678\n\nLuis Soto\nBad line ,,, \nMar, MAR@X.COM");
assert.equal(parsed.length, 4);
assert.equal(parsed[0].email, "ana@x.com");
assert.equal(parsed[0].phone, "+525512345678");
assert.equal(parsed[1].email, null); // no email
assert.equal(parsed[3].email, "mar@x.com"); // lowercased

// dedup vs existing (case-insensitive email) + within batch
const existing = [{ full_name: "Ana Ruiz", email: "ana@x.com", phone: null }, { full_name: "No Mail", email: null, phone: "5551112222" }];
const batch = parseGuestRows("Ana Ruiz, ANA@x.com\nNew Person, new@x.com\nNew Person, new@x.com\nNo Mail, , 555 111 2222");
const { toAdd, duplicates } = dedupeGuests(batch, existing);
assert.equal(duplicates, 3, `expected 3 dupes (ana existing, new@x.com twice→1, no-mail existing), got ${duplicates}`);
assert.equal(toAdd.length, 1);
assert.equal(toAdd[0].email, "new@x.com");

console.log("guest-import: parse + dedup ok");
