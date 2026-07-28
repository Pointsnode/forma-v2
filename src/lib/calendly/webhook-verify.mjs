import { createHmac, timingSafeEqual } from "node:crypto";

// Calendly webhook signature verification (same shape as Stripe's). The header
// `Calendly-Webhook-Signature` is `t=<unix>,v1=<hex hmac>`; the signed content is
// `${t}.${rawBody}`, HMAC-SHA256 under the subscription's signing key (which we
// stored, encrypted, at subscription-create). The route verifies BEFORE touching
// the DB. Pure + synchronous so it is unit-tested without a network or a database.

function parseHeader(header) {
  const out = { t: null, v1: null };
  for (const part of String(header || "").split(",")) {
    const [k, v] = part.split("=");
    if (k?.trim() === "t") out.t = v?.trim();
    if (k?.trim() === "v1") out.v1 = v?.trim();
  }
  return out;
}

/** True iff the signature is present, well-formed, and matches. toleranceSec>0
    also rejects timestamps older/newer than the window (replay-of-old defense). */
export function verifyCalendlySignature(rawBody, signatureHeader, signingKey, toleranceSec = 0, nowSec = null) {
  if (!signingKey) return false;
  const { t, v1 } = parseHeader(signatureHeader);
  if (!t || !v1) return false;
  if (toleranceSec > 0) {
    const now = nowSec == null ? Math.floor(Date.now() / 1000) : nowSec;
    const ts = Number(t);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceSec) return false;
  }
  const expected = createHmac("sha256", signingKey).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
