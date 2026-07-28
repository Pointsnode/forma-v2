import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.CALENDLY_TOKEN_ENC_KEY = "test-key-please-ignore-0123456789";
const { encryptToken, decryptToken } = await import("./crypto.mjs");
const { verifyCalendlySignature } = await import("./webhook-verify.mjs");
const { normalizeInviteeEvent } = await import("./normalize.mjs");

// ── AES-256-GCM roundtrip; ciphertext differs from plaintext; tamper is rejected ─
const secret = "eyJhbGciOi.some.access.token";
const enc = encryptToken(secret);
assert.notEqual(enc, secret, "stored value is ciphertext");
assert.equal(decryptToken(enc), secret, "roundtrip recovers the token");
assert.notEqual(encryptToken(secret), encryptToken(secret), "random IV → different ciphertext each time");
assert.throws(() => decryptToken(Buffer.from("AAAA" + Buffer.from(enc, "base64").toString("base64").slice(4), "base64").toString("base64")), "GCM auth rejects tampered ciphertext");

// ── webhook signature: valid passes, bad/missing/tampered fail ────────────────
const key = "whsec_abc123";
const body = JSON.stringify({ event: "invitee.created", payload: {} });
const t = "1700000000";
const good = createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
assert.equal(verifyCalendlySignature(body, `t=${t},v1=${good}`, key), true, "valid signature passes");
assert.equal(verifyCalendlySignature(body, `t=${t},v1=${good}`, "wrong-key"), false, "wrong key fails");
assert.equal(verifyCalendlySignature(body, `t=${t},v1=deadbeef`, key), false, "bad hmac fails");
assert.equal(verifyCalendlySignature(body, "", key), false, "missing header fails");
assert.equal(verifyCalendlySignature(body + "x", `t=${t},v1=${good}`, key), false, "tampered body fails");
assert.equal(verifyCalendlySignature(body, `t=${t},v1=${good}`, null), false, "no signing key fails closed");

// ── normalize: created → scheduled, canceled → canceled, junk → null ──────────
const base = {
  payload: {
    uri: "https://api.calendly.com/scheduled_events/EV/invitees/IN",
    name: "Camila", email: "c@x.com", cancel_url: "https://c", reschedule_url: "https://r",
    scheduled_event: { uri: "https://api.calendly.com/scheduled_events/EV", name: "Discovery call — 30 min", start_time: "2027-03-10T17:00:00Z", end_time: "2027-03-10T17:30:00Z", location: { join_url: "https://zoom" } },
  },
};
const created = normalizeInviteeEvent({ event: "invitee.created", ...base });
assert.equal(created.row.status, "scheduled");
assert.equal(created.row.calendly_event_uri, "https://api.calendly.com/scheduled_events/EV");
assert.equal(created.row.calendly_invitee_uri, "https://api.calendly.com/scheduled_events/EV/invitees/IN");
assert.equal(created.row.join_url, "https://zoom");
assert.equal(created.row.invitee_name, "Camila");
const canceled = normalizeInviteeEvent({ event: "invitee.canceled", ...base });
assert.equal(canceled.row.status, "canceled");
assert.equal(normalizeInviteeEvent({ event: "routing_form_submission.created", payload: {} }), null, "non-invitee event ignored");
assert.equal(normalizeInviteeEvent({ event: "invitee.created", payload: { uri: "IN" } }), null, "missing scheduled_event → null (nothing to store honestly)");

console.log("calendly: crypto roundtrip, signature verify, payload normalize ok");
