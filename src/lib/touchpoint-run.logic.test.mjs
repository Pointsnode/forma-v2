import assert from "node:assert/strict";
import { planTouchpointOutcome } from "./touchpoint-run.mjs";

// Skipped (RESEND_API_KEY unset): ledger NOT stamped, touchpoint back to
// scheduled, 0 sent, n skipped — the gate finding.
let o = planTouchpointOutcome({ sent: 0, skipped: true }, 8);
assert.equal(o.stampSent, false);
assert.equal(o.status, "scheduled");
assert.equal(o.sent, 0);
assert.equal(o.skipped, 8);

// Resend threw / failed: same protection.
o = planTouchpointOutcome({ failed: true }, 5);
assert.equal(o.stampSent, false);
assert.equal(o.status, "scheduled");
assert.equal(o.skipped, 5);

// Delivered: stamp, mark sent, count what Resend accepted (not rows.length).
o = planTouchpointOutcome({ sent: 8, skipped: false }, 8);
assert.equal(o.stampSent, true);
assert.equal(o.status, "sent");
assert.equal(o.sent, 8);

// Empty audience: nothing to send → legitimately completes.
o = planTouchpointOutcome({ sent: 0, skipped: false }, 0);
assert.equal(o.stampSent, true);
assert.equal(o.status, "sent");
assert.equal(o.sent, 0);

console.log("touchpoint-run: outcome honors the send result");
