import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStripeSignature, dedupeEvent, isPaymentEvent } from "./stripe-verify.mjs";

const secret = "whsec_test_secret";
const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const t = 1_700_000_000;
const good = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");

// valid signature within tolerance → passes
assert.equal(verifyStripeSignature(payload, `t=${t},v1=${good}`, secret, { nowSec: t + 10 }), true);

// tampered payload → fails
assert.equal(verifyStripeSignature(payload + "x", `t=${t},v1=${good}`, secret, { nowSec: t + 10 }), false);

// wrong secret → fails
assert.equal(verifyStripeSignature(payload, `t=${t},v1=${good}`, "whsec_wrong", { nowSec: t + 10 }), false);

// expired timestamp (outside 300s tolerance) → fails (replay protection)
assert.equal(verifyStripeSignature(payload, `t=${t},v1=${good}`, secret, { nowSec: t + 1000 }), false);

// missing / malformed header → fails
assert.equal(verifyStripeSignature(payload, "", secret, { nowSec: t }), false);
assert.equal(verifyStripeSignature(payload, "t=,v1=", secret, { nowSec: t }), false);
assert.equal(verifyStripeSignature(payload, null, secret, { nowSec: t }), false);

// idempotency: the same event id processes once, then is skipped (webhook backs
// this with the stripe_events PK; this proves the decision).
let seen = new Set();
let r1 = dedupeEvent(seen, "evt_1");
assert.equal(r1.process, true);
let r2 = dedupeEvent(r1.seen, "evt_1");
assert.equal(r2.process, false);           // duplicate delivery → no double effect
let r3 = dedupeEvent(r2.seen, "evt_2");
assert.equal(r3.process, true);            // a different event still processes

// only settlement events touch the ledger
assert.equal(isPaymentEvent("checkout.session.completed"), true);
assert.equal(isPaymentEvent("payment_intent.succeeded"), true);
assert.equal(isPaymentEvent("customer.created"), false);

console.log("stripe-verify: signature + idempotency ok");
