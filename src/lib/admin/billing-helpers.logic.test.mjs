import assert from "node:assert/strict";
import { formatCents } from "./money.mjs";
import { csvCell, toCsv } from "./csv.mjs";

// formatCents — cents-accurate (two decimals), never rounded to whole dollars.
assert.equal(formatCents(7900, "USD"), "$79.00");
assert.equal(formatCents(7105, "USD"), "$71.05");
assert.equal(formatCents(0, "USD"), "$0.00"); // 0 is a real figure, not null
assert.equal(formatCents(null, "USD"), "$0.00");
assert.equal(formatCents(-500, "USD"), "-$5.00");

// CSV formula-injection guard — text starting with = + - @ is quote-prefixed; numbers are not.
assert.equal(csvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
assert.equal(csvCell("@cmd"), "'@cmd");
assert.equal(csvCell("+cmd"), "'+cmd");
assert.equal(csvCell("-5.00"), "-5.00");       // a negative number is data, left intact
assert.equal(csvCell("7900"), "7900");
assert.equal(csvCell("plain"), "plain");
// Quoting for commas/quotes/newlines.
assert.equal(csvCell('a,b'), '"a,b"');
assert.equal(csvCell('she said "hi"'), '"she said ""hi"""');

// toCsv — header + rows, CRLF terminated.
const csv = toCsv(["id", "amount"], [["in_1", "79.00"], ["=x", "1,2"]]);
assert.equal(csv, 'id,amount\r\nin_1,79.00\r\n\'=x,"1,2"\r\n');

console.log("admin billing-helpers: cents formatting + csv guard ok");
