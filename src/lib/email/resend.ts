import "server-only";

// reply_to (Resend's snake_case field) lets the STUDIO send while replies land in the sending
// planner's own inbox — the send-via-forma spine. It passes straight through the batch body.
export type Email = { from: string; to: string[]; subject: string; html: string; text: string; reply_to?: string };

// Send a batch through Resend. If RESEND_API_KEY is unset (dev / preview before
// Gio wires it), skip gracefully so the run still completes — nothing is sent and
// the caller decides whether to stamp. Tracking stays off (no open/click pixels).
export async function sendBatch(emails: Email[]): Promise<{ sent: number; skipped: boolean }> {
  if (emails.length === 0) return { sent: 0, skipped: false };
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`RESEND_API_KEY unset — skipping ${emails.length} email(s)`);
    return { sent: 0, skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend batch failed (${res.status}): ${body.slice(0, 300)}`);
    throw new Error(`resend ${res.status}`);
  }
  return { sent: emails.length, skipped: false };
}
