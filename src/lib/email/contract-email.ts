import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { emailShell, emailButton } from "./shell";
import type { Email } from "./resend";

const FROM = "Forma <contracts@forma.events>";

// The signer email, a signer receives their tokenized /sign link (no account). Fully in the
// signer's language via the email.* namespace (L3 — no fallback).
export async function signerEmail(opts: { to: string; signerName: string; title: string; signUrl: string; locale: string }): Promise<Email> {
  const t = await getTranslations({ locale: opts.locale, namespace: "email" });
  const line = t("contract.signerLine", { name: opts.signerName });
  return {
    from: FROM, to: [opts.to], subject: t("contract.signerSubject", { title: opts.title }),
    html: emailShell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${line}</p>${emailButton(opts.signUrl, t("contract.signerButton"))}`, t("shell.held")),
    text: `${line}\n${opts.signUrl}`,
  };
}

// Phase-1 invites the gate created: email each couple their portal join link, once (marks
// emailed_at). Called from the Stripe webhook after the deposit is paid. In the wedding's
// language (the email.* namespace; no fallback).
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
  const { data: w } = await admin.from("weddings").select("locale").eq("id", weddingId).maybeSingle();
  const t = await getTranslations({ locale: (w?.locale as string | null) ?? locale, namespace: "email" });
  const line = t("contract.portalLine");
  const emails: Email[] = [];
  for (const inv of rows) {
    const url = `${baseUrl}/join/${inv.token.trim()}`;
    emails.push({
      from: FROM, to: [inv.email], subject: t("contract.portalSubject"),
      html: emailShell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${line}</p>${emailButton(url, t("contract.portalButton"))}`, t("shell.held")),
      text: `${line}\n${url}`,
    });
    await admin.from("wedding_invites").update({ emailed_at: new Date().toISOString() }).eq("id", inv.id);
  }
  return emails;
}
