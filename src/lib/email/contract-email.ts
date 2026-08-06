import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailShell, emailButton } from "./shell";

type Email = { from: string; to: string[]; subject: string; html: string; text: string };
const FROM = "Forma <contracts@forma.events>";

// The signer email, a signer receives their tokenized /sign link (no account).
export function signerEmail(opts: { to: string; signerName: string; title: string; signUrl: string; locale: string }): Email {
  const es = opts.locale === "es";
  const subject = es ? `Para tu firma, ${opts.title}` : `For your signature, ${opts.title}`;
  const line = es
    ? `Hola ${opts.signerName}: tu documento está listo. Revísalo y fírmalo cuando quieras.`
    : `Hi ${opts.signerName}, your document is ready. Review and sign whenever you're ready.`;
  return {
    from: FROM, to: [opts.to], subject,
    html: emailShell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${line}</p>${emailButton(opts.signUrl, es ? "Revisar y firmar" : "Review & sign")}`, opts.locale),
    text: `${line}\n${opts.signUrl}`,
  };
}

// Phase-1 invites the gate created: email each couple their portal join link,
// once (marks emailed_at). Called from the Stripe webhook after the deposit is paid
// (the gate can also fire on contract completion, but no sign-action caller is wired).
export async function phase1InviteEmails(admin: SupabaseClient, weddingId: string, baseUrl: string, locale = "en"): Promise<Email[]> {
  const { data } = await admin
    .from("wedding_invites")
    .select("id, token, email")
    .eq("wedding_id", weddingId)
    .eq("role", "partner")
    .is("used_at", null)
    .is("emailed_at", null)
    .not("email", "is", null);
  const rows = (data ?? []) as { id: string; token: string; email: string }[];
  // §3/§5 — the couple's portal-ready email follows the WEDDING's language (fallback to the
  // passed locale, then en). FR/IT bodies gracefully fall back to EN until the email catalog.
  const { data: w } = await admin.from("weddings").select("locale").eq("id", weddingId).maybeSingle();
  const es = ((w?.locale as string | null) ?? locale) === "es";
  const emails: Email[] = [];
  for (const inv of rows) {
    const url = `${baseUrl}/join/${inv.token.trim()}`;
    const line = es
      ? "Tu agreement está firmado y tu depósito recibido, tu portal de boda está listo."
      : "Your agreement is signed and your deposit received, your wedding portal is ready.";
    emails.push({
      from: FROM, to: [inv.email],
      subject: es ? "Tu portal de Forma está listo" : "Your Forma portal is ready",
      html: emailShell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${line}</p>${emailButton(url, es ? "Abrir mi portal" : "Open my portal")}`, es ? "es" : "en"),
      text: `${line}\n${url}`,
    });
    await admin.from("wedding_invites").update({ emailed_at: new Date().toISOString() }).eq("id", inv.id);
  }
  return emails;
}
