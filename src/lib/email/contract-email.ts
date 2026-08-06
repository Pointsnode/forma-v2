import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type Email = { from: string; to: string[]; subject: string; html: string; text: string };
const FROM = "Forma <contracts@forma.events>";

function shell(body: string): string {
  return `<div style="font-family:Georgia,'Playfair Display',serif;color:#121212;background:#F7F4EE;padding:28px">
    <div style="font-size:22px;letter-spacing:.04em"><span style="font-style:italic">f</span>orma</div>${body}</div>`;
}
function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:14px;background:#121212;color:#F7F4EE;text-decoration:none;padding:11px 22px;border-radius:99px;font-family:Inter,Arial,sans-serif;font-size:14px">${label}</a>`;
}

// The signer email, a signer receives their tokenized /sign link (no account).
export function signerEmail(opts: { to: string; signerName: string; title: string; signUrl: string; locale: string }): Email {
  const es = opts.locale === "es";
  const subject = es ? `Para tu firma, ${opts.title}` : `For your signature, ${opts.title}`;
  const line = es
    ? `Hola ${opts.signerName}: tu documento está listo. Revísalo y fírmalo cuando quieras.`
    : `Hi ${opts.signerName}, your document is ready. Review and sign whenever you're ready.`;
  return {
    from: FROM, to: [opts.to], subject,
    html: shell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${line}</p>${button(opts.signUrl, es ? "Revisar y firmar" : "Review & sign")}`),
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
      html: shell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${line}</p>${button(url, es ? "Abrir mi portal" : "Open my portal")}`),
      text: `${line}\n${url}`,
    });
    await admin.from("wedding_invites").update({ emailed_at: new Date().toISOString() }).eq("id", inv.id);
  }
  return emails;
}
