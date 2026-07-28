import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// App-layer token encryption (ported from v1's 0057 posture): Calendly access/
// refresh tokens + the webhook signing key are AES-256-GCM ciphertext at rest, so a
// DB read shows only ciphertext — decryption happens ONLY here, in the app, under
// CALENDLY_TOKEN_ENC_KEY. The key env value is hashed to a stable 32 bytes so any
// format (base64 / hex / raw 32-byte) Gio pastes works identically.

function keyBuffer() {
  const raw = process.env.CALENDLY_TOKEN_ENC_KEY;
  if (!raw) throw new Error("CALENDLY_TOKEN_ENC_KEY is not set");
  return createHash("sha256").update(raw, "utf8").digest(); // 32 bytes
}

/** plaintext → base64(iv[12] | tag[16] | ciphertext). */
export function encryptToken(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** base64(iv | tag | ciphertext) → plaintext (throws on tamper — GCM auth). */
export function decryptToken(payload) {
  const buf = Buffer.from(String(payload), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyBuffer(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function encKeyConfigured() {
  return !!process.env.CALENDLY_TOKEN_ENC_KEY;
}
