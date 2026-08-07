import "server-only";
import { getTranslations } from "next-intl/server";
import { emailShell, emailButton } from "./shell";
import type { Email } from "./resend";

const FROM = "Forma <studio@forma.events>";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The couple's notification when the planner leaves a design note, in the wedding's language
// via the email.* namespace (L3 — no fallback). The image is inlined (a long-lived signed URL).
export async function commentEmail(opts: { to: string; couple: string; planner: string; imageUrl: string | null; studioUrl: string; body: string; locale: string }): Promise<Email> {
  const t = await getTranslations({ locale: opts.locale, namespace: "email" });
  const subject = t("design.commentSubject", { couple: opts.couple });
  const lead = t("design.commentLead", { planner: opts.planner });
  const cta = t("design.commentCta");
  const img = opts.imageUrl ? `<img src="${opts.imageUrl}" alt="" style="max-width:100%;border-radius:4px;margin:14px 0" />` : "";
  const html = emailShell(
    `<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:0">${esc(lead)}</p>${img}
    <p style="font-size:15px;font-style:italic;color:#3B3833">&ldquo;${esc(opts.body)}&rdquo;</p>
    ${emailButton(opts.studioUrl, cta)}`,
    t("shell.held"),
  );
  return { from: FROM, to: [opts.to], subject, html, text: `${lead}\n\n"${opts.body}"\n\n${cta}: ${opts.studioUrl}` };
}
