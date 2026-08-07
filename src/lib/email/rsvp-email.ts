import "server-only";
import { getTranslations } from "next-intl/server";
import { emailShell, emailButton } from "./shell";
import type { Email } from "./resend";

// On-brand RSVP emails through the Edition One shell, fully in the recipient's language via
// the email.* namespace (L3 — no FR/IT→EN fallback).
type Kind = "rsvp_invite" | "rsvp_reminder" | "rsvp_close";
type Args = { to: string; guestName: string; couple: string; rsvpUrl: string; kind: Kind; locale: string };
const SUBJECT: Record<Kind, string> = { rsvp_invite: "inviteSubject", rsvp_reminder: "reminderSubject", rsvp_close: "closeSubject" };
const LEAD: Record<Kind, string> = { rsvp_invite: "inviteLead", rsvp_reminder: "reminderLead", rsvp_close: "closeLead" };

export async function rsvpEmail({ to, guestName, couple, rsvpUrl, kind, locale }: Args): Promise<Email> {
  const t = await getTranslations({ locale, namespace: "email" });
  const subject = t(`rsvp.${SUBJECT[kind]}`, { couple });
  const hi = t("rsvp.hi", { name: guestName });
  const lead = t(`rsvp.${LEAD[kind]}`, { couple });
  const cta = t("rsvp.cta");
  const footer = t("rsvp.footer");
  const html = emailShell(
    `<p style="font-family:'Playfair Display',Georgia,serif;font-size:26px;line-height:1.25;margin:0 0 12px;color:#121212">${escapeHtml(couple)}</p>
    <p style="font-size:15px;color:#3B3833;margin:0 0 6px">${escapeHtml(hi)}</p>
    <p style="font-size:15px;color:#3B3833;margin:0">${escapeHtml(lead)}</p>
    ${emailButton(rsvpUrl, cta)}
    <p style="font-size:12px;color:#8A867E;margin-top:26px;font-family:Arial,sans-serif">${escapeHtml(footer)}</p>`,
    t("shell.held"),
  );
  return { from: "Forma <rsvp@forma.events>", to: [to], subject, html, text: `${hi}\n\n${lead}\n\n${cta}: ${rsvpUrl}\n\n${footer}` };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
